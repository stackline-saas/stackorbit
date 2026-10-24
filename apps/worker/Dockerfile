# ==============================================================================
# Multi-stage Dockerfile for Background Worker
# ==============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

RUN apk add --no-cache python3 make g++ git openssl

# Copy root monorepo files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* .npmrc ./
COPY packages/shared ./packages/shared
COPY packages/database ./packages/database
COPY apps/worker ./apps/worker

RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --frozen-lockfile=false

RUN pnpm --filter @docker-domain/shared build
RUN pnpm --filter @docker-domain/database prisma:generate
RUN pnpm --filter @docker-domain/database build
RUN pnpm --filter @docker-domain/worker build

# ==============================================================================
# Runner Image
# ==============================================================================
FROM node:22-alpine AS runner

WORKDIR /app

RUN apk add --no-cache git docker-cli curl ca-certificates openssl

ENV NODE_ENV=production

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* .npmrc ./
COPY packages/shared ./packages/shared
COPY packages/database ./packages/database
COPY apps/worker ./apps/worker

RUN corepack enable && corepack prepare pnpm@latest --activate
RUN pnpm install --prod --frozen-lockfile=false
RUN pnpm --filter @docker-domain/database prisma:generate

COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/database/dist ./packages/database/dist
COPY --from=builder /app/packages/database/prisma ./packages/database/prisma
COPY --from=builder /app/apps/worker/dist ./apps/worker/dist

RUN mkdir -p /app/temp/builds /app/traefik/dynamic /app/traefik/certs

CMD ["node", "apps/worker/dist/index.js"]
