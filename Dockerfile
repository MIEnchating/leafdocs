FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS builder
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY . .
# A clean checkout may have no public directory. The build needs no live database.
RUN mkdir -p public && DOCKER_BUILD=1 DATABASE_URL=postgresql://build:build@127.0.0.1:1/build npm run build \
    && node scripts/prepare-docker.mjs

FROM base AS runner
ENV NODE_ENV=production PORT=3210 NEXT_TELEMETRY_DISABLED=1
# Copy the traced server and migration tools, without build caches or development dependencies.
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/prisma/schema.prisma ./prisma/schema.prisma
COPY --from=builder --chown=node:node /app/prisma/migrations ./prisma/migrations
COPY --from=builder --chown=node:node /app/scripts/start-production.sh ./scripts/start-production.sh
RUN mkdir -p .data/uploads && chown -R node:node .data
USER node
EXPOSE 3210
CMD ["sh", "scripts/start-production.sh"]
