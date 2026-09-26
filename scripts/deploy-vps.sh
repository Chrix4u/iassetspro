#!/bin/bash
# =============================================================================
# EAM System - VPS Deployment Script
# =============================================================================
# CRITICAL ENVIRONMENT INFO:
#   - Project path:  /home/ifleetpro/git/eam-system (NOT /root)
#   - EAM port:      3001 (3000 is used by ifleetpro)
#   - HOSTNAME:      0.0.0.0 required (nginx proxies to 127.0.0.1:3001)
#   - PM2 name:      eam-system
#   - Nginx config:  /usr/local/apps/nginx/etc/conf.d/00-iassetspro.conf
#   - Prisma:        Uses symlinks (NEVER cp -r)
#   - DB:            PostgreSQL, Prisma-managed schema
#
# USAGE:
#   cd /home/ifleetpro/git/eam-system && bash scripts/deploy-vps.sh       # Full deploy
#   cd /home/ifleetpro/git/eam-system && bash scripts/deploy-vps.sh --fast # Skip deps install
#   cd /home/ifleetpro/git/eam-system && bash scripts/deploy-vps.sh --swap # Only setup swap
#   cd /home/ifleetpro/git/eam-system && bash scripts/deploy-vps.sh --seed # Only seed transitions
# =============================================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKIP_DEPS=false
SWAP_ONLY=false
SEED_ONLY=false
MAX_OLD_SPACE=${NODE_MAX_OLD_SPACE:-1024}

# CRITICAL: EAM must run on port 3001 with hostname 0.0.0.0
EAM_PORT=3001
EAM_HOSTNAME=0.0.0.0
EAM_PM2_NAME="eam-system"

# Parse arguments
for arg in "$@"; do
  case "$arg" in
    --fast)  SKIP_DEPS=true ;;
    --swap)  SWAP_ONLY=true ;;
    --seed)  SEED_ONLY=true ;;
    --mem=*) MAX_OLD_SPACE="${arg#*=}" ;;
    --help|-h)
      echo "Usage: $0 [--fast] [--swap] [--seed] [--mem=MB]"
      echo "  --fast    Skip deps install (faster if deps unchanged)"
      echo "  --swap    Only setup swap space, then exit"
      echo "  --seed    Only seed status_transitions table, then exit"
      echo "  --mem=MB  Set Node.js max old space (default: 1024)"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg"
      exit 1
      ;;
  esac
done

# =============================================================================
# FUNCTION: Seed status transitions
# =============================================================================
seed_transitions() {
  echo ""
  echo -e "${CYAN}[seed]${NC} Seeding status_transitions table..."

  # Load DATABASE_URL from .env
  local db_url=""
  if [ -f "$SCRIPT_DIR/../.env" ]; then
    db_url=$(grep '^DATABASE_URL=' "$SCRIPT_DIR/../.env" 2>/dev/null | head -1 | cut -d'=' -f2- | tr -d '"' | tr -d "'")
  fi

  if [ -z "$db_url" ]; then
    db_url=${DATABASE_URL:-""}
  fi

  if [ -z "$db_url" ]; then
    echo -e "  ${RED}✗${NC} DATABASE_URL not found. Set it in .env or as env var."
    return 1
  fi

  # Reconcile canonical lifecycle transitions through PostgreSQL.
  DATABASE_URL="$db_url" bun run "$SCRIPT_DIR/seed-transitions.ts"
  echo -e "  ${GREEN}✓${NC} Transitions seeded"
}

# =============================================================================
# FUNCTION: Check & Setup Swap Space
# =============================================================================
ensure_swap() {
  echo -e "${CYAN}[swap]${NC} Checking available memory..."

  local total_mem_mb=$(free -m | awk '/^Mem:/ {print $2}')
  local total_swap_mb=$(free -m | awk '/^Swap:/ {print $2}')
  local available_mb=$(free -m | awk '/^Mem:/ {print $7}')

  echo "  Memory: ${total_mem_mb}MB total, ${available_mb}MB available"
  echo "  Swap:   ${total_swap_mb}MB"

  if [ "$total_swap_mb" -ge 2048 ]; then
    echo -e "  ${GREEN}✓${NC} Swap already sufficient (${total_swap_mb}MB)"
    return 0
  fi

  if [ "$total_mem_mb" -ge 4096 ] && [ "$available_mb" -ge 2000 ]; then
    echo -e "  ${GREEN}✓${NC} Sufficient RAM available (${available_mb}MB free)"
    return 0
  fi

  echo -e "  ${YELLOW}!${NC} Low memory detected — setting up swap space..."

  local swap_size=2048

  if [ -f /swapfile ]; then
    echo "  /swapfile already exists, ensuring it's active..."
    swapon /swapfile 2>/dev/null || true
    local current_swap=$(free -m | awk '/^Swap:/ {print $2}')
    if [ "$current_swap" -ge 1024 ]; then
      echo -e "  ${GREEN}✓${NC} Swap active (${current_swap}MB)"
      return 0
    fi
  fi

  echo "  Allocating ${swap_size}MB swap file..."
  sudo fallocate -l ${swap_size}M /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile
  sudo swapon /swapfile

  if ! grep -q '/swapfile' /etc/fstab; then
    echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
    echo "  Added swap to /etc/fstab (persistent across reboots)"
  fi

  echo 10 | sudo tee /proc/sys/vm/swappiness > /dev/null

  local final_swap=$(free -m | awk '/^Swap:/ {print $2}')
  echo -e "  ${GREEN}✓${NC} Swap configured: ${final_swap}MB available"
}

# =============================================================================
# Handle --seed early exit
# =============================================================================
if [ "$SEED_ONLY" = true ]; then
  cd "$SCRIPT_DIR/.."
  seed_transitions
  exit $?
fi

# =============================================================================
# MAIN DEPLOYMENT
# =============================================================================

echo ""
echo "========================================="
echo "  EAM VPS Deploy"
echo "  $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "  Port: ${EAM_PORT}, Host: ${EAM_HOSTNAME}"
echo "  Node heap limit: ${MAX_OLD_SPACE}MB"
echo "========================================="

# Step 1: Setup swap
echo ""
echo -e "${CYAN}[1/7]${NC} Memory & Swap Setup"
ensure_swap

if [ "$SWAP_ONLY" = true ]; then
  echo ""
  echo -e "${GREEN}✓${NC} Swap setup complete."
  echo ""
  free -h
  exit 0
fi

# Step 2: Pull latest code
echo ""
echo -e "${CYAN}[2/7]${NC} Pulling latest code..."
cd "$SCRIPT_DIR/.."
git fetch origin
git reset --hard origin/main
echo -e "  ${GREEN}✓${NC} Now at: $(git log --oneline -1)"

# Step 3: Install dependencies
if [ "$SKIP_DEPS" = false ]; then
  echo ""
  echo -e "${CYAN}[3/7]${NC} Installing dependencies..."
  bun install --frozen-lockfile 2>/dev/null || bun install
  echo -e "  ${GREEN}✓${NC} Dependencies installed"
else
  echo ""
  echo -e "${CYAN}[3/7]${NC} Skipping dependency install (--fast mode)"
fi

# Step 4: Clean and build
echo ""
echo -e "${CYAN}[4/7]${NC} Building Next.js (memory-limited)..."

if [ -d .next ]; then
  echo "  Cleaning old build artifacts..."
  rm -rf .next
fi

echo "  Starting build (max heap: ${MAX_OLD_SPACE}MB)..."
echo "  This may take 2-4 minutes on low-memory VPS..."

export NEXT_TELEMETRY_DISABLED=1

set +e
NODE_OPTIONS="--max-old-space-size=${MAX_OLD_SPACE}" bun run build 2>&1 | tee /tmp/eam-build.log
BUILD_EXIT=${PIPESTATUS[0]}
set -e

if [ "$BUILD_EXIT" -ne 0 ]; then
  echo ""
  echo -e "${RED}✗${NC} Build failed with exit code $BUILD_EXIT"

  if [ "$BUILD_EXIT" -eq 137 ]; then
    echo -e "${RED}BUILD WAS KILLED BY OOM (exit 137)${NC}"
    echo ""
    echo "Your VPS doesn't have enough memory. Solutions:"
    echo "  1. Run: bash $0 --swap    (add 2GB swap)"
    echo "  2. Run: bash $0 --mem=512  (use even less memory)"
    echo "  3. Close other processes to free RAM"
    echo "  4. Upgrade your VPS to 2GB+ RAM"
    echo ""
    free -h
  else
    echo "Last 10 lines of build log:"
    tail -10 /tmp/eam-build.log
  fi
  exit 1
fi

echo -e "  ${GREEN}✓${NC} Build successful!"

# Step 5: Generate Prisma client & symlink to standalone
echo ""
echo -e "${CYAN}[5/7]${NC} Generating Prisma client & symlinking..."

STANDALONE=".next/standalone"

# Regenerate Prisma client
echo "  Generating Prisma client..."
npx prisma generate 2>&1 | tail -3 || echo -e "  ${YELLOW}!${NC} prisma generate had warnings (may be non-fatal)"

# CRITICAL: Use SYMLINKS, not cp -r
# cp -r causes infinite nesting and hangs on large dirs
# Path: standalone/node_modules -> ../../../ -> project root/node_modules
STANDALONE_NM="${STANDALONE}/node_modules"
rm -rf "${STANDALONE_NM}/.prisma" "${STANDALONE_NM}/@prisma" "${STANDALONE_NM}/pg"

ln -s ../../../node_modules/.prisma "${STANDALONE_NM}/.prisma"
ln -s ../../../node_modules/@prisma "${STANDALONE_NM}/@prisma"
ln -s ../../../node_modules/pg "${STANDALONE_NM}/pg"
echo -e "  ${GREEN}✓${NC} Prisma & pg symlinked (3 links)"

# Verify symlinks
local_err=false
for link in .prisma @prisma pg; do
  if [ ! -L "${STANDALONE_NM}/${link}" ]; then
    echo -e "  ${RED}✗${NC} Symlink ${link} is not a link!"
    local_err=true
  fi
done
if [ "$local_err" = true ]; then
  echo -e "  ${RED}✗${NC} Symlink verification failed!"
  exit 1
fi

# Copy static files
cp -r .next/static "${STANDALONE}/.next/"
cp -r public "${STANDALONE}/"
echo -e "  ${GREEN}✓${NC} Static assets copied"

# Step 6: Patch server.js
echo ""
echo -e "${CYAN}[6/7]${NC} Patching server.js..."

if [ -f patch-server.js ]; then
  node patch-server.js
  echo -e "  ${GREEN}✓${NC} Server patched"
else
  echo -e "  ${YELLOW}!${NC} patch-server.js not found, skipping"
fi

# Step 7: Restart with PM2 (CRITICAL: PORT=3001, HOSTNAME=0.0.0.0)
echo ""
echo -e "${CYAN}[7/7]${NC} Restarting EAM via PM2..."

# Always delete and recreate to ensure PORT and HOSTNAME are set correctly
pm2 delete "$EAM_PM2_NAME" 2>/dev/null || true

PORT=$EAM_PORT HOSTNAME=$EAM_HOSTNAME NODE_ENV=production \
  pm2 start "${STANDALONE}/server.js" --name "$EAM_PM2_NAME"

pm2 save
echo -e "  ${GREEN}✓${NC} PM2 started: ${EAM_PM2_NAME} (port ${EAM_PORT}, host ${EAM_HOSTNAME})"

# Wait for server to start
echo "  Waiting for server to start..."
sleep 10

# Verify
echo ""
echo -e "${CYAN}[verify]${NC} Checking server health..."

# Check if listening
if ss -tlnp 2>/dev/null | grep -q ":${EAM_PORT}.*127.0.0.1"; then
  echo -e "  ${GREEN}✓${NC} Server listening on 127.0.0.1:${EAM_PORT}"
else
  echo -e "  ${RED}✗${NC} Server NOT listening on 127.0.0.1:${EAM_PORT}"
  ss -tlnp 2>/dev/null | grep "${EAM_PORT}" | head -3
fi

# Health check
local_health=$(curl -s --connect-timeout 5 http://127.0.0.1:${EAM_PORT}/api/health 2>/dev/null || echo "FAILED")
if echo "$local_health" | grep -q "success\|error\|Authentication"; then
  echo -e "  ${GREEN}✓${NC} Health check passed: ${local_health:0:80}..."
else
  echo -e "  ${RED}✗${NC} Health check failed or server not ready"
  echo "  Checking error logs:"
  pm2 logs "$EAM_PM2_NAME" --err --lines 5 --nostream 2>/dev/null || true
fi

# Seed transitions
echo ""
seed_transitions

# Summary
echo ""
echo "========================================="
echo -e "  ${GREEN}✓ Deployment Complete!${NC}"
echo "========================================="
echo ""
echo "  App:    https://iassetspro.lightworldtech.com"
echo "  Port:   ${EAM_PORT}"
echo "  PM2:    pm2 logs ${EAM_PM2_NAME} --lines 50"
echo "  Nginx:  /usr/local/apps/nginx/etc/conf.d/00-iassetspro.conf"
echo ""
free -h
echo ""
pm2 list 2>/dev/null || true
echo ""
