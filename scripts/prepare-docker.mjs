import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const { nodeFileTrace } = require("next/dist/compiled/@vercel/nft");
const destination = path.resolve(".next/standalone");

// The web server is already traced by Next. Trace the migration CLI separately;
// it is not reachable from web routes but is required on every deployment.
const { fileList } = await nodeFileTrace(["node_modules/prisma/build/index.js"]);
for (const file of fileList) {
  if (!file.startsWith("node_modules/")) continue;
  const target = path.join(destination, file);
  await mkdir(path.dirname(target), { recursive: true });
  await cp(file, target, { dereference: true });
}
// Prisma selects this executable at runtime by platform, so static tracing cannot find it.
const engines = "node_modules/@prisma/engines";
const binaries = (await readdir(engines)).filter(name => name.startsWith("schema-engine-") && !name.endsWith(".sha256"));
if (!binaries.length) throw new Error("Prisma schema engine is missing from the build.");
for (const name of binaries) await cp(path.join(engines, name), path.join(destination, engines, name));

// Bundle the TypeScript initializer so production does not need tsx or a compiler.
await build({
  entryPoints: ["prisma/seed.ts"], outfile: path.join(destination, "prisma/seed.cjs"),
  bundle: true, platform: "node", target: "node22", format: "cjs", minify: true,
  external: ["@prisma/client"],
});
const { name, version } = JSON.parse(await readFile("package.json", "utf8"));
await writeFile(path.join(destination, "package.json"), JSON.stringify({
  name, version, private: true,
  scripts: {
    start: "node server.js",
    "db:migrate": "node node_modules/prisma/build/index.js migrate deploy",
    "db:seed": "node prisma/seed.cjs",
  },
}, null, 2) + "\n");
