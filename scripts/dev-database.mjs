// An isolated, persistent PostgreSQL instance for local development.
// Runs as the current user, or the existing nobody account when invoked as root.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { access, chmod, chown, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { parse } from "dotenv";
import pg from "pg";

const project = resolve(import.meta.dirname, "..");
const stateDir = join(project, ".data");
await mkdir(stateDir, { recursive: true, mode: 0o700 });
const envPath = join(project, ".env");
let environment;
try { environment = parse(await readFile(envPath)); }
catch (error) {
  if (error.code !== "ENOENT") throw error;
  const databasePassword = randomBytes(24).toString("hex");
  const adminPassword = randomBytes(18).toString("base64url");
  environment = {
    DATABASE_URL: `postgresql://docs:${databasePassword}@127.0.0.1:55439/new_api_docs?schema=public`,
    APP_URL: "http://localhost:3210",
    ADMIN_EMAIL: "admin@newapi.local",
    ADMIN_PASSWORD: adminPassword,
  };
  await writeFile(envPath, Object.entries(environment).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n") + "\n", { mode: 0o600, flag: "wx" });
  await writeFile(join(stateDir, "local-admin.txt"), `仅用于本机开发\n登录地址：http://localhost:3210/login\n邮箱：${environment.ADMIN_EMAIL}\n密码：${adminPassword}\n`, { mode: 0o600 });
  console.log("已创建 .env；本机登录信息位于 .data/local-admin.txt。");
}

const databaseUrl = new URL(environment.DATABASE_URL);
if (databaseUrl.hostname !== "127.0.0.1" || databaseUrl.port !== "55439") {
  throw new Error("db:dev 仅管理 127.0.0.1:55439 的独立开发数据库。外部数据库请直接运行 db:migrate。");
}
const root = process.getuid?.() === 0;
const identity = root ? { uid: 65534, gid: 65534 } : {};
if (root && process.platform !== "linux") throw new Error("请使用普通用户启动开发数据库。");
const binaryModule = await import(`@embedded-postgres/${process.platform === "win32" ? "windows" : process.platform}-${process.arch}`);
const nativeSource = resolve(dirname(binaryModule.postgres), "..");
// npm 12 may block package postinstall scripts. This reviewed local script only restores library symlinks.
const hydrateScript = join(nativeSource, "..", "scripts", "hydrate-symlinks.js");
await run(process.execPath, [hydrateScript], { cwd: resolve(nativeSource, "..") });
const statePath = join(stateDir, "dev-postgres.json");
let runtime;
try { runtime = JSON.parse(await readFile(statePath, "utf8")).runtime; }
catch (error) {
  if (error.code !== "ENOENT") throw error;
  runtime = root ? await mkdtemp("/var/tmp/new-api-docs-pg-") : join(stateDir, "postgres-runtime");
  await mkdir(runtime, { recursive: true, mode: 0o755 });
  await chmod(runtime, 0o755);
  await writeFile(statePath, JSON.stringify({ runtime }) + "\n", { mode: 0o600 });
}
const native = join(runtime, "native");
try { await access(process.platform === "linux" ? join(native, "lib", "libpq.so.5") : join(native, "bin", "postgres")); }
catch { await cp(nativeSource, native, { recursive: true, dereference: true }); }
for (const name of ["postgres", "initdb", "pg_ctl"]) await chmod(join(native, "bin", name), 0o755);
const data = join(runtime, "data");
await mkdir(data, { recursive: true, mode: 0o700 });
if (root) await chown(data, identity.uid, identity.gid);
try { await access(join(data, "PG_VERSION")); }
catch {
  const passwordFile = join(runtime, "password");
  await writeFile(passwordFile, decodeURIComponent(databaseUrl.password) + "\n", { mode: 0o600 });
  if (root) await chown(passwordFile, identity.uid, identity.gid);
  try {
    await run(join(native, "bin", "initdb"), ["-D", data, "--username=docs", "--auth=scram-sha-256", `--pwfile=${passwordFile}`, "--encoding=UTF8", "--locale=C"], identity);
  } finally { await rm(passwordFile, { force: true }); }
}
const status = spawn(join(native, "bin", "pg_ctl"), ["-D", data, "status"], { ...identity, cwd: runtime, stdio: "ignore" });
const running = await new Promise(resolveStatus => status.on("exit", code => resolveStatus(code === 0)));
if (!running) await run(join(native, "bin", "pg_ctl"), ["-D", data, "-l", join(data, "server.log"), "-o", `-h 127.0.0.1 -p 55439 -k ${data}`, "-w", "start"], identity);
const adminUrl = new URL(databaseUrl);
adminUrl.pathname = "/postgres";
adminUrl.search = "";
const client = new pg.Client({ connectionString: adminUrl.toString() });
await client.connect();
try {
  const databaseName = databaseUrl.pathname.slice(1);
  if (!/^[a-z_][a-z0-9_]*$/.test(databaseName)) throw new Error("开发数据库名称不合法。");
  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);
  if (!exists.rowCount) await client.query(`CREATE DATABASE "${databaseName}"`);
} finally { await client.end(); }
console.log(`开发 PostgreSQL 已就绪：127.0.0.1:55439；持久化目录：${data}`);
console.log("下一步：npm run db:migrate && npm run db:seed && npm run dev");

function run(executable, args, options) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(executable, args, { cwd: "/tmp", stdio: "inherit", ...options });
    child.on("error", reject);
    child.on("exit", code => code === 0 ? resolveRun() : reject(new Error(`${executable} exited with ${code}`)));
  });
}
