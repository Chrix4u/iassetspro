#!/usr/bin/env bash
# ============================================================================
# iAssetsPro EAM Platform — Production Startup Script
# Usage: ./scripts/start-production.sh
#
# This script:
#   1. Validates required environment variables
#   2. Generates the Prisma client
#   3. Applies committed Prisma migrations to PostgreSQL
#   4. Starts the application with PM2
#   5. Verifies application health
# ============================================================================

set -euo pipefail

# ---- Color Helpers ---------------------------------------------------------
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*"; }

# ---- Configuration ---------------------------------------------------------
APP_NAME="eam-system"
APP_DIR="${APP_DIR:-/opt/eam-system}"
HEALTH_URL="${HEALTH_URL:-http://localhost:3000/api/health}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-120}"   # max seconds to wait for health check
HEALTH_INTERVAL="${HEALTH_INTERVAL:-5}"   # seconds between health check retries
PM2_MAX_MEMORY="${PM2_MAX_MEMORY:-1G}"
PM2_INSTANCES="${PM2_INSTANCES:-1}"

# ---- Banner ----------------------------------------------------------------
echo ""
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN} iAssetsPro EAM — Production Startup${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""

# ---- Step 1: Check Required Environment Variables --------------------------
info "Validating environment variables..."

REQUIRED_VARS=(
  "DATABASE_URL"
  "JWT_SECRET"
  "NEXTAUTH_SECRET"
)

MISSING_VARS=()
for var in "${REQUIRED_VARS[@]}"; do
  if [ -z "${!var:-}" ]; then
    MISSING_VARS+=("$var")
  fi
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
  error "The following required environment variables are not set:"
  for var in "${MISSING_VARS[@]}"; do
    echo -e "       ${RED}• $var${NC}"
  done
  echo ""
  error "Please set them in your .env file or export them before running this script."
  exit 1
fi

ok "All required environment variables are set."

# Optional vars — warn if missing
OPTIONAL_VARS=(
  "REDIS_URL"
  "SMTP_HOST"
  "MQTT_BROKER_URL"
  "S3_ENDPOINT"
)

for var in "${OPTIONAL_VARS[@]}"; do
  if [ -z "${!var:-}" ]; then
    warn "$var is not set — some features may be unavailable."
  fi
done

echo ""

# ---- Step 2: Navigate to Application Directory -----------------------------
if [ ! -f "$APP_DIR/package.json" ]; then
  error "package.json not found at $APP_DIR"
  error "Please set APP_DIR to the correct project root."
  exit 1
fi

cd "$APP_DIR"
ok "Working directory: $(pwd)"
echo ""

# ---- Step 3: Install Dependencies ------------------------------------------
if [ -f "bun.lock" ]; then
  info "Installing dependencies with bun..."
  bun install --frozen-lockfile
  ok "Dependencies installed."
else
  warn "bun.lock not found. Running bun install without lockfile..."
  bun install
  ok "Dependencies installed (without lockfile)."
fi
echo ""

# ---- Step 4: Generate Prisma Client ----------------------------------------
info "Generating Prisma client..."
if bunx prisma generate; then
  ok "Prisma client generated."
else
  error "Prisma client generation failed."
  exit 1
fi
echo ""

# ---- Step 5: Apply Committed Database Migrations ---------------------------
info "Applying committed Prisma migrations..."
if bunx prisma migrate deploy 2>&1; then
  ok "Database migrations applied successfully."
else
  error "Prisma migration deploy failed. Refusing to mutate production with db push."
  error "Check DATABASE_URL, migration history, and database connectivity."
  exit 1
fi
echo ""

# ---- Step 6: Build Application ---------------------------------------------
info "Building Next.js application..."
if bun run build:local; then
  ok "Application built successfully."
else
  error "Application build failed."
  exit 1
fi
echo ""

# ---- Step 7: Start with PM2 ------------------------------------------------
info "Starting application with PM2..."

# Check if PM2 is installed
if ! command -v pm2 &>/dev/null; then
  warn "PM2 is not installed. Installing globally..."
  npm install -g pm2
  ok "PM2 installed."
fi

# Stop existing process if running
if pm2 describe "$APP_NAME" &>/dev/null; then
  info "Stopping existing PM2 process '$APP_NAME'..."
  pm2 stop "$APP_NAME" || true
  pm2 delete "$APP_NAME" || true
fi

# Start the application
# Determine the start command based on how the app is run
if [ -f "$APP_DIR/.next/standalone/server.js" ]; then
  # Production standalone build
  pm2 start "$APP_DIR/.next/standalone/server.js" \
    --name "$APP_NAME" \
    --node-args="--max-old-space-size=2048" \
    --max-memory-restart "$PM2_MAX_MEMORY" \
    -i "$PM2_INSTANCES" \
    --env NODE_ENV=production
else
  # Fallback: use npm start
  pm2 start npm \
    --name "$APP_NAME" \
    -- start \
    --max-memory-restart "$PM2_MAX_MEMORY" \
    -i "$PM2_INSTANCES"
fi

# Save PM2 process list for auto-restart on reboot
pm2 save

ok "Application started with PM2 (name: $APP_NAME, instances: $PM2_INSTANCES)."
echo ""

# ---- Step 8: Health Check Verification -------------------------------------
info "Waiting for application to become healthy..."
info "Health endpoint: $HEALTH_URL"
info "Timeout: ${HEALTH_TIMEOUT}s"

ELAPSED=0
HEALTHY=false

while [ "$ELAPSED" -lt "$HEALTH_TIMEOUT" ]; do
  # Try to fetch the health endpoint
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "$HEALTH_URL" 2>/dev/null || echo "000")

  if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 500 ]; then
    HEALTHY=true
    break
  fi

  sleep "$HEALTH_INTERVAL"
  ELAPSED=$((ELAPSED + HEALTH_INTERVAL))
  info "  ... not ready yet (${ELAPSED}s elapsed, HTTP $HTTP_CODE)"
done

echo ""

if [ "$HEALTHY" = true ]; then
  ok "Application is healthy! (HTTP $HTTP_CODE after ${ELAPSED}s)"
else
  error "Application failed to become healthy within ${HEALTH_TIMEOUT}s."
  echo ""
  error "PM2 logs:"
  pm2 logs "$APP_NAME" --lines 20 --nostream 2>&1 || true
  exit 1
fi

echo ""

# ---- Step 9: Startup Summary -----------------------------------------------
echo -e "${CYAN}========================================${NC}"
echo -e "${GREEN}  ✓ STARTUP COMPLETE${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "  Application:  ${GREEN}$APP_NAME${NC}"
echo -e "  Instances:    ${GREEN}$PM2_INSTANCES${NC}"
echo -e "  Health:       ${GREEN}OK (HTTP $HTTP_CODE)${NC}"
echo -e "  URL:          ${GREEN}$HEALTH_URL${NC}"
echo -e "  Uptime:       ${GREEN}${ELAPSED}s${NC}"
echo ""
info "Useful commands:"
echo "  pm2 logs $APP_NAME       — View logs"
echo "  pm2 monit               — Monitor processes"
echo "  pm2 restart $APP_NAME   — Restart application"
echo "  pm2 stop $APP_NAME      — Stop application"
echo "  pm2 delete $APP_NAME    — Remove process"
echo ""