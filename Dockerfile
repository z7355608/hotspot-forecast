# syntax=docker/dockerfile:1.7

# ─────────────────────────────────────────────────────────────────
# Stage 1: build
# ─────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

# pnpm via Corepack (lockfile is pnpm)
RUN corepack enable

WORKDIR /app

# Install deps first (cache friendly)
COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile

# Copy source and build
COPY . .
RUN pnpm build

# ─────────────────────────────────────────────────────────────────
# Stage 2: prod deps only (smaller node_modules)
# ─────────────────────────────────────────────────────────────────
FROM node:20-alpine AS prod-deps

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY patches ./patches
RUN pnpm install --frozen-lockfile --prod

# ─────────────────────────────────────────────────────────────────
# Stage 3: runtime
# ─────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner

WORKDIR /app

# Non-root user (security baseline)
RUN addgroup -S app && adduser -S app -G app

ENV NODE_ENV=production
ENV PORT=3000

# Built artifacts + production node_modules
COPY --from=builder --chown=app:app /app/dist ./dist
COPY --from=prod-deps --chown=app:app /app/node_modules ./node_modules
COPY --chown=app:app package.json ./

# Drizzle migrations run at startup if needed (see deployment.md)
COPY --chown=app:app drizzle ./drizzle

# data/ is a runtime dir; create empty mountpoint
RUN mkdir -p /app/data && chown app:app /app/data

USER app

EXPOSE 3000

# Healthcheck — hits /healthz (defined in server/_core/index.ts)
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3000/healthz >/dev/null 2>&1 || exit 1

CMD ["node", "dist/index.js"]
