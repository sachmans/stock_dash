# ─── Stage 1: Build ───────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build client (Vite) and server (esbuild)
RUN pnpm build

# ─── Stage 2: Production ─────────────────────────────────────────────
FROM node:22-alpine AS production

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts from builder
COPY --from=builder /app/dist ./dist

# Copy drizzle migrations
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts

# Copy skill definitions (used at runtime for local skill rendering)
COPY --from=builder /app/server/lib/skills.yaml ./server/lib/skills.yaml

# Copy scripts
COPY --from=builder /app/scripts ./scripts

# Non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S stockdash -u 1001 -G nodejs
USER stockdash

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT:-3000}/api/trpc/stock.getProviderStatus || exit 1

# Default port (overridable via PORT env)
EXPOSE 3000

# Start the server
CMD ["node", "dist/index.js"]
