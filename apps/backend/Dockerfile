# ==============================================================================
# Multi-stage Dockerfile for Backend REST API
# ==============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++ git openssl

# Copy monorepo config and sources
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* .npmrc ./
COPY packages/shared ./packages/shared
COPY packages/database ./packages/database
COPY apps/backend ./apps/backend
COPY apps/frontend ./apps/frontend

RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
RUN pnpm install --frozen-lockfile=false

RUN pnpm --filter @stackorbit/shared build
RUN pnpm --filter @stackorbit/database prisma:generate
RUN pnpm --filter @stackorbit/database build
RUN pnpm --filter @stackorbit/backend build
RUN pnpm --filter @stackorbit/frontend build

# ==============================================================================
# Runner Image
# ==============================================================================
FROM node:22-alpine AS runner

WORKDIR /app

RUN apk add --no-cache git docker-cli docker-cli-compose curl ca-certificates openssl

ENV NODE_ENV=production
ENV PORT=3000

RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

# Copy full monorepo with installed node_modules, generated prisma client and dist builds
COPY --from=builder /app /app

# Ensure frontend SPA assets are in /app/public
RUN mkdir -p /app/public && cp -r /app/apps/frontend/dist/* /app/public/
RUN mkdir -p /app/traefik/dynamic /app/traefik/certs

EXPOSE 3000

CMD ["sh", "-c", "pnpm --filter @stackorbit/database prisma:push --accept-data-loss && pnpm --filter @stackorbit/database prisma:seed && node apps/backend/dist/server.js"]
