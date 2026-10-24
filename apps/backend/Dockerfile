# ==============================================================================
# Multi-stage Dockerfile for Backend REST API
# ==============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++ git openssl

# Copy monorepo config
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* .npmrc ./
COPY packages/shared ./packages/shared
COPY packages/database ./packages/database
COPY apps/backend ./apps/backend
COPY apps/frontend ./apps/frontend

RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile=false

RUN pnpm --filter @docker-domain/shared build
RUN pnpm --filter @docker-domain/database prisma:generate
RUN pnpm --filter @docker-domain/database build
RUN pnpm --filter @docker-domain/backend build
RUN pnpm --filter @docker-domain/frontend build

# ==============================================================================
# Runner Image
# ==============================================================================
FROM node:22-alpine AS runner

WORKDIR /app

RUN apk add --no-cache git docker-cli docker-cli-compose curl ca-certificates openssl

ENV NODE_ENV=production
ENV PORT=3000

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* .npmrc ./
COPY packages/shared ./packages/shared
COPY packages/database ./packages/database
COPY apps/backend ./apps/backend

RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --prod --frozen-lockfile=false
RUN pnpm --filter @docker-domain/database prisma:generate

COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/database/dist ./packages/database/dist
COPY --from=builder /app/packages/database/prisma ./packages/database/prisma
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist
COPY --from=builder /app/apps/frontend/dist ./public

RUN mkdir -p /app/traefik/dynamic /app/traefik/certs

EXPOSE 3000

CMD ["sh", "-c", "pnpm --filter @docker-domain/database prisma:push --accept-data-loss && node packages/database/dist/seed.js && node apps/backend/dist/server.js"]
