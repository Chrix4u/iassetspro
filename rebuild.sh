#!/bin/bash
# ============================================================
# VPS REBUILD SCRIPT — run this on your VPS after git pull
# Usage: bash rebuild.sh
# ============================================================
set -e

echo "===== iAssetsPro VPS Rebuild ====="

# 1. Generate fresh Prisma client
echo "[1/4] Generating Prisma client..."
npx prisma generate

# 2. Apply committed migrations safely
echo "[2/4] Applying Prisma migrations..."
npx prisma migrate deploy

# 3. Build production app (embeds the freshly generated PostgreSQL client)
echo "[3/4] Building production app..."
npm run build

# 4. Restart
echo "[4/4] Restarting application..."
pm2 restart all 2>/dev/null || true
# If not using pm2, try: systemctl restart iassetspro

echo ""
echo "===== Rebuild complete! ====="
echo "Test: curl -s https://your-domain.com/api/debug/db-health"