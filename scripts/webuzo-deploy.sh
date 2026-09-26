#!/bin/bash
# =============================================================================
# EAM System - Quick Manual Deploy Script (Webuzo VPS)
# =============================================================================
# Run this on your VPS anytime to manually pull and deploy the latest code.
#
# USAGE:
#   cd ~/eam-system && bash scripts/webuzo-deploy.sh
#
# =============================================================================

set -e

APP_PATH="${1:-$HOME/eam-system}"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo ""
echo -e "${BLUE}═══════════════════════════════════════${NC}"
echo -e "${BLUE}  EAM System - Quick Deploy${NC}"
echo -e "${BLUE}  $(date '+%Y-%m-%d %H:%M:%S %Z')${NC}"
echo -e "${BLUE}═══════════════════════════════════════${NC}"

cd "$APP_PATH" || { echo "Error: $APP_PATH not found"; exit 1; }

echo -e "${GREEN}[1/6]${NC} Pulling latest code..."
git fetch origin main
git reset --hard origin/main
echo "  Commit: $(git log --oneline -1)"

echo -e "${GREEN}[2/6]${NC} Installing dependencies..."
npm install --legacy-peer-deps 2>&1 | tail -3

echo -e "${GREEN}[3/6]${NC} Setting up Prisma client..."
if [ -d "prisma/prebuilt/.prisma" ]; then
    cp -r prisma/prebuilt/.prisma node_modules/.prisma
else
    npx prisma generate
fi

echo -e "${GREEN}[4/6]${NC} Building Next.js..."
export NEXT_TELEMETRY_DISABLED=1
npx next build 2>&1 | tail -5

echo -e "${GREEN}[5/6]${NC} Copying assets..."
cp -r node_modules/.prisma/client .next/standalone/node_modules/.prisma/client
cp -r node_modules/@prisma/adapter-pg .next/standalone/node_modules/@prisma/adapter-pg 2>/dev/null || true
cp -r node_modules/pg .next/standalone/node_modules/pg 2>/dev/null || true
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/

[ -f "patch-server.js" ] && node patch-server.js

echo -e "${GREEN}[6/6]${NC} Restarting..."
pm2 restart eam-system 2>/dev/null || pm2 start npm --name eam-system -- start
pm2 save

echo ""
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}  Deploy Complete!${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo ""
echo "  Check status: pm2 logs eam-system"
echo ""
