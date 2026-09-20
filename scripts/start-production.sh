#!/bin/sh
set -eu

export NODE_ENV=production
# Render supplies the public HTTPS origin. APP_URL overrides it for custom domains.
export APP_URL="${APP_URL:-${RENDER_EXTERNAL_URL:-}}"
: "${DATABASE_URL:?Set DATABASE_URL before starting production}"
: "${APP_URL:?Set APP_URL to the public HTTPS origin}"

node --input-type=module <<'JS'
let valid = false;
try {
  const url = new URL(process.env.APP_URL);
  valid = url.protocol === "https:" && !url.username && !url.password &&
    url.pathname === "/" && !url.search && !url.hash;
} catch {}
if (!valid) {
  console.error("APP_URL must be a public HTTPS origin without a path, query, or credentials.");
  process.exit(1);
}
JS

npm run db:migrate
exec ./node_modules/.bin/next start --hostname 0.0.0.0 --port "${PORT:-3210}"
