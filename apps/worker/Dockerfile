# ==============================================================================
# Multi-stage Dockerfile for Background Worker
# ==============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++ git openssl

# Copy monorepo config and sources
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* .npmrc ./
COPY packages/shared ./packages/shared
COPY packages/database ./packages/database
COPY apps/worker ./apps/worker

RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
RUN pnpm install --frozen-lockfile=false

RUN pnpm --filter @stackorbit/shared build
RUN pnpm --filter @stackorbit/database prisma:generate
RUN pnpm --filter @stackorbit/database build
RUN pnpm --filter @stackorbit/worker build

# ==============================================================================
# Runner Image
# ==============================================================================
FROM node:22-alpine AS runner

WORKDIR /app

RUN apk add --no-cache git docker-cli docker-cli-compose curl ca-certificates openssl

ENV NODE_ENV=production

RUN corepack enable && corepack prepare pnpm@9.12.3 --activate

# Copy full monorepo with installed node_modules, generated prisma client and dist builds
COPY --from=builder /app /app

RUN mkdir -p /app/temp/builds /app/traefik/dynamic /app/traefik/certs

CMD ["node", "apps/worker/dist/index.js"]
