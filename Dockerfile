# ============================================================================
# iAssetsPro EAM Platform — Production Multi-Stage Dockerfile
# Built with Bun runtime for optimal performance
# ============================================================================

# Pin both the Bun version and the immutable multi-platform image index digest.
# This prevents oven/bun:1.4.2 from silently changing underneath a reviewed SHA.
ARG BUN_IMAGE=oven/bun:1.4.2@sha256:9114c058aeae42162ee16dd5084b95fe9473970bb6bcb5b232ab1630f0546895

# ---------------------------------------------------------------------------
# Stage 1: Dependencies
# ---------------------------------------------------------------------------
FROM ${BUN_IMAGE} AS deps

WORKDIR /app

# Copy dependency manifests first (leverages Docker layer caching)
COPY package.json bun.lock ./

# Install ALL dependencies (including devDependencies needed for build)
RUN bun install --frozen-lockfile

# ---------------------------------------------------------------------------
# Stage 2: Build
# ---------------------------------------------------------------------------
FROM ${BUN_IMAGE} AS builder

WORKDIR /app

# Release metadata is passed by CI/deploy and made available to Next.js at
# build time so the image can report the exact source revision it contains.
ARG NEXT_PUBLIC_BUILD_VERSION=unknown
ARG NEXT_PUBLIC_BUILD_TIME=unknown
ENV NEXT_PUBLIC_BUILD_VERSION=${NEXT_PUBLIC_BUILD_VERSION}
ENV NEXT_PUBLIC_BUILD_TIME=${NEXT_PUBLIC_BUILD_TIME}

# Prisma 7 loads prisma.config.ts even for client generation. The build must not
# receive production database credentials, so give the builder a non-routable,
# non-secret URL that satisfies configuration parsing only. This ENV belongs to
# the builder stage and is not inherited by the final runtime image.
ENV DATABASE_URL="mysql://build:build@127.0.0.1:3306/build"

# Copy dependency manifests and node_modules from deps stage
COPY package.json bun.lock ./
COPY --from=deps /app/node_modules ./node_modules

# Copy prisma schema and generate Prisma client
COPY prisma/ ./prisma/
RUN bunx prisma generate

# Copy source code
COPY . .

# Build Next.js standalone output
# build:local runs: prisma generate -> next build -> copy static & public assets
RUN bun run build:local

# ---------------------------------------------------------------------------
# Stage 3: Production Runtime
# ---------------------------------------------------------------------------
FROM ${BUN_IMAGE} AS runner

WORKDIR /app

# Set production environment. DATABASE_URL is intentionally absent here and is
# supplied at runtime from the production Compose .env configuration.
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# The official Bun image already provides an unprivileged `bun` user/group.
# Use Docker's ownership-aware COPY instead of distro-specific adduser/addgroup
# commands, which are not guaranteed to exist in every Bun base image variant.
COPY --chown=bun:bun --from=builder /app/.next/standalone ./
COPY --chown=bun:bun --from=builder /app/.next/static    ./.next/static
COPY --chown=bun:bun --from=builder /app/public          ./public

# Copy Prisma schema for operational inspection / future controlled migrations.
COPY --chown=bun:bun --from=builder /app/prisma ./prisma

# Copy necessary runtime Prisma engine files
COPY --chown=bun:bun --from=builder /app/node_modules/.prisma/client ./node_modules/.prisma/client
COPY --chown=bun:bun --from=builder /app/node_modules/@prisma/adapter-mariadb ./node_modules/@prisma/adapter-mariadb
COPY --chown=bun:bun --from=builder /app/node_modules/mariadb ./node_modules/mariadb

# Copy package.json for runtime metadata/script references
COPY --chown=bun:bun --from=builder /app/package.json ./package.json

# Ensure persistent mount points exist with the runtime user's ownership before
# Docker creates/populates named volumes on first deployment.
RUN mkdir -p /app/data /app/public/uploads && \
    chown -R bun:bun /app/data /app/public/uploads

# Switch to the image's built-in non-root user
USER bun

# Expose application port
EXPOSE 3000

# Health check uses Bun itself so the runtime does not depend on wget/curl being
# present in the base image.
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

# `.next/standalone` is copied into /app, so its server entrypoint is /app/server.js.
CMD ["bun", "server.js"]
