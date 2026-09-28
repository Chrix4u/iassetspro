#!/bin/bash
# =============================================================================
# EAM System - cPanel Deployment Script
# =============================================================================
# Everything is PRE-BUILT. This script just restores the Prisma client
# and verifies the setup. No build, no npm install, no Prisma CLI.
#
# PREREQUISITES:
#   1. Node.js 20+ activated (nodevenv)
#   2. .env file with database credentials (DB_HOST=localhost)
#   3. Database already seeded (done remotely from sandbox)
#
# USAGE:
#   chmod +x DEPLOY.sh && ./DEPLOY.sh
# =============================================================================

set -e

echo "========================================="
echo "  EAM System - cPanel Deployment"
echo "  (Pre-built — zero build steps)"
echo "========================================="

# ── Step 1: Check prerequisites ──
echo ""
echo "[1/3] Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo "ERROR: Node.js not found. Activate your nodevenv first:"
    echo "  source /home/lightwor/nodevenv/eam-system/20/bin/activate"
    exit 1
fi
echo "  Node.js: $(node --version)"

if [ ! -f .env ]; then
    echo "ERROR: .env file not found!"
    echo "  Create .env with: DB_HOST=localhost, DB_USER, DB_PASSWORD, DB_NAME"
    exit 1
fi
echo "  .env: found"

if ! grep -q '^GTP_MIGRATION_SIGNING_KEY=.' .env; then
    echo "  WARNING: GTP_MIGRATION_SIGNING_KEY is not configured."
    echo "           Historical GTP import execution will remain safely locked."
else
    echo "  GTP migration signing key: configured"
fi

if [ ! -f ".next/standalone/server.js" ]; then
    echo "ERROR: .next/standalone/server.js not found!"
    echo "  Run: git pull origin main"
    exit 1
fi
echo "  Standalone server: found"

# ── Step 2: Restore Prisma client into standalone ──
echo ""
echo "[2/3] Restoring Prisma client..."

if [ -d "prisma/prebuilt/.prisma/client" ]; then
    rm -rf .next/standalone/node_modules/.prisma/client
    cp -r prisma/prebuilt/.prisma/client .next/standalone/node_modules/.prisma/client
    echo "  Prisma client restored to .next/standalone/node_modules/.prisma/client"
else
    echo "  WARNING: prisma/prebuilt/.prisma/client not found!"
    exit 1
fi

# ── Step 3: Quick smoke test ──
echo ""
echo "[3/3] Verifying..."

node -e "
const path = require('path');
const serverPath = path.resolve('.next/standalone/server.js');
try {
  // Just verify the file can be parsed (won't start listening)
  require('vm').runInNewContext(
    'var module={exports:{}}; var require=function(m){return {}}; var process={env:{PORT:3000},on:function(){},exit:function(){}};' +
    require('fs').readFileSync(serverPath, 'utf8').replace(/listen\(/g, '_listen_(')
  );
  console.log('  server.js: OK (syntax valid)');
} catch(e) {
  console.error('  server.js: PARSE ERROR - ' + e.message.substring(0, 100));
}
" 2>&1

echo ""
echo "========================================="
echo "  Deployment complete!"
echo "========================================="
echo ""
echo "Configure cPanel Node.js app:"
echo "  App Root:     eam-system"
echo "  Startup File: .next/standalone/server.js"
echo "  Run Command:  (leave empty — cPanel handles it)"
echo "  App Mode:     Production"
echo ""
echo "Or test manually:"
echo "  cd ~/eam-system"
echo "  PORT=3000 NODE_ENV=production node .next/standalone/server.js"
echo ""
