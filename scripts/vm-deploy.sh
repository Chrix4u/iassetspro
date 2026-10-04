#!/bin/bash
# =============================================================================
# EAM System - Manual Deploy Script (run on the VM)
# =============================================================================
# Pulls latest code, builds, and restarts. Handles low-memory VPS by:
#   - Adding swap space if needed
#   - Limiting Node.js heap size to prevent OOM kills
#
# USAGE:
#   ./vm-deploy.sh              # Deploy latest main
#   ./vm-deploy.sh --fast       # Skip deps install (faster)
#   ./vm-deploy.sh --swap       # Only setup swap, then exit
#   ./vm-deploy.sh --mem=512    # Use 512MB max heap (lower = less OOM risk)
# =============================================================================

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

BRANCH="main"
SKIP_DEPS=false
SWAP_ONLY=false
MAX_OLD_SPACE=${NODE_MAX_OLD_SPACE:-1024}

for arg in "$@"; do
  case "$arg" in
    --fast)  SKIP_DEPS=true ;;
    --swap)  SWAP_ONLY=true ;;
    --mem=*) MAX_OLD_SPACE="${arg#*=}" ;;
    --no-build) echo "Deprecated: use --fast instead"; SKIP_DEPS=true ;;
    -h|--help)
      echo "Usage: $0 [--fast] [--swap] [--mem=MB] [branch]"
      exit 0 ;;
    -*) echo "Unknown: $arg"; exit 1 ;;
    *) BRANCH="$arg" ;;
  esac
done

echo ""
echo "========================================="
echo "  EAM Manual Deploy"
echo "  Branch: $BRANCH"
echo "  Node heap: ${MAX_OLD_SPACE}MB"
echo "  $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "========================================="

# ── Swap Setup ──────────────────────────────────────────────────────────────
ensure_swap() {
  local total_swap_mb=$(free -m | awk '/^Swap:/ {print $2}')
  local total_mem_mb=$(free -m | awk '/^Mem:/ {print $2}')

  echo -e "  RAM: ${total_mem_mb}MB | Swap: ${total_swap_mb}MB"

  if [ "$total_swap_mb" -ge 1024 ]; then
    echo -e "  ${GREEN}✓${NC} Swap OK"
    return 0
  fi

  echo -e "  ${YELLOW}!${NC} Low swap — adding 2GB..."

  [ -f /swapfile ] && { swapon /swapfile 2>/dev/null || true; }

  if [ "$(free -m | awk '/^Swap:/ {print $2}')" -ge 1024 ]; then
    echo -e "  ${GREEN}✓${NC} Swap activated"
    return 0
  fi

  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  echo 10 | sudo tee /proc/sys/vm/swappiness > /dev/null
  echo -e "  ${GREEN}✓${NC} 2GB swap added (persistent)"
}

cd ~/git/eam-system

echo ""
echo -e "${CYAN}[1/5]${NC} Memory check"
ensure_swap

[ "$SWAP_ONLY" = true ] && { echo -e "${GREEN}Done.${NC}"; free -h; exit 0; }

# ── Pull ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}[2/5]${NC} Pulling $BRANCH..."
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git reset --hard "origin/$BRANCH"
echo "  $(git log --oneline -1)"

# ── Dependencies ────────────────────────────────────────────────────────────
if [ "$SKIP_DEPS" = false ]; then
  echo ""
  echo -e "${CYAN}[3/5]${NC} Installing dependencies..."
  bun install --frozen-lockfile 2>/dev/null || bun install
else
  echo ""
  echo -e "${CYAN}[3/5]${NC} Skipping deps (--fast)"
fi

# ── Build ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}[4/5]${NC} Building..."

rm -rf .next

# Always generate from the checked-out schema. Never inject a checked-in
# generated client from another database provider.
bunx prisma generate

export NEXT_TELEMETRY_DISABLED=1

echo "  Building with max heap ${MAX_OLD_SPACE}MB..."

set +e
NODE_OPTIONS="--max-old-space-size=${MAX_OLD_SPACE}" bun run build 2>&1 | tail -20
BUILD_EXIT=${PIPESTATUS[0]}
set -e

if [ "$BUILD_EXIT" -ne 0 ]; then
  echo -e "${RED}Build failed (exit $BUILD_EXIT)${NC}"
  [ "$BUILD_EXIT" -eq 137 ] && echo -e "${RED}OOM KILL! Run: bash $0 --swap${NC}"
  exit 1
fi

# ── Copy & Patch ────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}[5/5]${NC} Copying assets & restarting..."

cp -r node_modules/.prisma/client .next/standalone/node_modules/.prisma/client
cp -r node_modules/@prisma/adapter-mariadb .next/standalone/node_modules/@prisma/adapter-mariadb 2>/dev/null || true
cp -r node_modules/mariadb .next/standalone/node_modules/mariadb 2>/dev/null || true
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/

[ -f patch-server.js ] && node patch-server.js

if command -v pm2 &> /dev/null && pm2 describe eam-system &> /dev/null; then
  pm2 restart eam-system --update-env
  echo -e "  ${GREEN}✓${NC} PM2 restarted"
else
  echo -e "  ${YELLOW}Start: cd .next/standalone && NODE_ENV=production node server.js${NC}"
fi

echo ""
echo "========================================="
echo -e "  ${GREEN}Done!${NC}"
echo "========================================="
free -h
pm2 list 2>/dev/null || true
