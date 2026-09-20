import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import { spawn } from "node:child_process";
import test from "node:test";
import pg from "pg";

test("startup validates credentials, creates one administrator concurrently, and preserves existing accounts", { timeout: 60_000 }, async () => {
  assert(process.env.DATABASE_URL, "Set DATABASE_URL to a test PostgreSQL database.");
  const schema = `bootstrap_test_${randomBytes(8).toString("hex")}`;
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.set("schema", schema);
  const password = randomBytes(24).toString("base64url");
  const env = { ...process.env, DATABASE_URL: url.href, ADMIN_EMAIL: "Startup@Example.com", ADMIN_PASSWORD: password };
  function run(script, overrides = {}) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, script, { env: { ...env, ...overrides }, stdio: ["ignore", "pipe", "pipe"] });
      let output = "";
      child.stdout.on("data", value => { output += value; });
      child.stderr.on("data", value => { output += value; });
      child.on("error", reject);
      child.on("exit", code => resolve({ code, output }));
    });
  }
  const bootstrap = overrides => run(["--import", "tsx", "prisma/bootstrap.ts"], overrides);
  try {
    await db.query(`CREATE SCHEMA "${schema}"`);
    const migrated = await run(["node_modules/prisma/build/index.js", "migrate", "deploy"]);
    assert.equal(migrated.code, 0, "Test database migration must succeed.");
    for (const invalid of [
      { ADMIN_EMAIL: "", ADMIN_PASSWORD: "" },
      { ADMIN_EMAIL: "invalid-email" },
      { ADMIN_PASSWORD: "short" },
    ]) {
      const result = await bootstrap(invalid);
      assert.equal(result.code, 1);
      assert(!result.output.includes(password), "Never log credentials.");
      assert.equal((await db.query(`SELECT count(*)::int AS count FROM "${schema}"."User"`)).rows[0].count, 0);
    }
    const results = await Promise.all([bootstrap(), bootstrap()]);
    assert(results.every(result => result.code === 0), "Concurrent first startups must succeed.");
    assert(results.every(result => !result.output.includes(password)));
    const users = (await db.query(`SELECT * FROM "${schema}"."User"`)).rows;
    assert.equal(users.length, 1);
    assert.equal(users[0].email, "startup@example.com");
    const parts = users[0].passwordHash.split("$");
    const derived = scryptSync(password, Buffer.from(parts[5], "base64url"), 64, { N: 65536, r: 8, p: 1, maxmem: 128 * 1024 * 1024 });
    assert.equal(derived.toString("base64url"), parts[6]);
    const changed = await bootstrap({ ADMIN_EMAIL: "someone-else@example.com", ADMIN_PASSWORD: randomBytes(24).toString("hex") });
    assert.equal(changed.code, 0);
    const missing = await bootstrap({ ADMIN_EMAIL: "", ADMIN_PASSWORD: "" });
    assert.equal(missing.code, 0, "Existing installations must start without bootstrap credentials.");
    assert.deepEqual((await db.query(`SELECT * FROM "${schema}"."User"`)).rows, users);
    assert.equal((await db.query(`SELECT count(*)::int AS count FROM "${schema}"."Document"`)).rows[0].count, 0, "Startup must not recreate sample documents.");
  } finally {
    await db.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await db.end();
  }
});
