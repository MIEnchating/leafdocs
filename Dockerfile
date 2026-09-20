FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS builder
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY . .
# A clean checkout may have no public directory. The build needs no live database.
RUN mkdir -p public && DATABASE_URL=postgresql://build:build@127.0.0.1:1/build npm run build

FROM base AS runner
ENV NODE_ENV=production PORT=3210 NEXT_TELEMETRY_DISABLED=1
# Keep Prisma CLI and tsx available for database migrations and administrator setup.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/src ./src
COPY --from=builder --chown=node:node /app/scripts ./scripts
COPY --from=builder --chown=node:node /app/package.json /app/package-lock.json /app/next.config.ts /app/tsconfig.json ./
RUN mkdir -p .data/uploads && chown -R node:node .data
USER node
EXPOSE 3210
CMD ["sh", "scripts/start-production.sh"]
