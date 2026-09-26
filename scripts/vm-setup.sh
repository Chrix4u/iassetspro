#!/bin/bash
# =============================================================================
# EAM System - One-Time VM Setup Script
# =============================================================================
# Run this script ONCE on your Compute Engine VM to prepare it for auto-deploy.
#
# This script will:
#   1. Install Node.js 20 (if not present)
#   2. Install PM2 process manager
#   3. Clone the repo from GitHub
#   4. Install dependencies and build the app
#   5. Set up PM2 to auto-start the app on VM reboot
#   6. Configure the firewall rule for port 3000
#
# USAGE:
#   Option A: SSH in and paste this:
#     curl -fsSL https://raw.githubusercontent.com/christianagbotah/eam-system/main/scripts/vm-setup.sh | bash
#
#   Option B: Copy the script to VM and run:
#     chmod +x vm-setup.sh && ./vm-setup.sh
#
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[✓]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
log_error() { echo -e "${RED}[✗]${NC} $1"; }
log_step()  { echo -e "\n${BLUE}── $1 ──${NC}"; }

echo ""
echo "========================================="
echo "  EAM System - VM Setup"
echo "  $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "========================================="

# ── Step 1: Install Node.js 20 ──
log_step "Step 1: Installing Node.js 20"

if command -v node &> /dev/null; then
    NODE_VER=$(node --version | cut -d. -f1 | tr -d 'v')
    if [ "$NODE_VER" -ge 20 ]; then
        log_info "Node.js $(node --version) already installed"
    else
        log_warn "Node.js $(node --version) found but v20+ required. Upgrading..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi
else
    log_info "Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

log_info "Node.js: $(node --version)"
log_info "npm: $(npm --version)"

# ── Step 2: Install PM2 ──
log_step "Step 2: Installing PM2 process manager"

if command -v pm2 &> /dev/null; then
    log_info "PM2 $(pm2 --version) already installed"
else
    sudo npm install -g pm2
    log_info "PM2 installed globally"
fi

# ── Step 3: Clone or update the repo ──
log_step "Step 3: Setting up project"

REPO_DIR="$HOME/eam-system"

if [ -d "$REPO_DIR" ]; then
    log_info "Existing project found at $REPO_DIR"
    cd "$REPO_DIR"
    git pull origin main 2>/dev/null || log_warn "Git pull skipped (local changes or no remote)"
else
    log_info "Cloning repository..."
    git clone https://github.com/christianagbotah/eam-system.git "$REPO_DIR"
    cd "$REPO_DIR"
fi

# ── Step 4: Create .env if missing ──
log_step "Step 4: Environment configuration"

if [ ! -f .env ]; then
    log_warn ".env file not found!"
    echo ""
    echo "  Create .env with your database credentials:"
    echo "  ─────────────────────────────────────────"
    echo "  cat > .env << 'EOF'"
    echo "  DATABASE_URL=\"postgresql://USER:PASSWORD@HOST:5432/DB_NAME\""
    echo "  NEXTAUTH_SECRET=\"$(openssl rand -hex 32)\""
    echo "  NEXTAUTH_URL=\"http://$(curl -s ifconfig.me 2>/dev/null || echo 'YOUR_VM_IP'):3000\""
    echo "  EOF"
    echo ""
    log_warn "IMPORTANT: Edit .env with your real database credentials before continuing!"
    log_warn "Then re-run: cd ~/eam-system && npm install && npm run build && pm2 start npm --name eam-system -- start"
else
    log_info ".env file found"
fi

# ── Step 5: Install dependencies and build ──
log_step "Step 5: Installing dependencies"

npm install --legacy-peer-deps 2>&1 | tail -3
log_info "Dependencies installed"

log_info "Generating Prisma client..."
npx prisma generate

log_info "Building Next.js (this may take 2-3 minutes)..."
export NEXT_TELEMETRY_DISABLED=1
npx next build

log_info "Copying static assets..."
cp -r node_modules/.prisma/client .next/standalone/node_modules/.prisma/client
cp -r node_modules/@prisma/adapter-pg .next/standalone/node_modules/@prisma/adapter-pg 2>/dev/null || true
cp -r node_modules/pg .next/standalone/node_modules/pg 2>/dev/null || true
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/

# ── Step 6: Start with PM2 ──
log_step "Step 6: Starting with PM2"

if pm2 describe eam-system &> /dev/null; then
    pm2 restart eam-system
    log_info "PM2 process restarted"
else
    pm2 start npm --name eam-system -- start
    log_info "PM2 process started"
fi

pm2 save
pm2 startup 2>/dev/null | tail -1 || true

log_info "PM2 status:"
pm2 list

# ── Step 7: Firewall ──
log_step "Step 7: Firewall configuration"

VM_IP=$(curl -s ifconfig.me 2>/dev/null || echo "YOUR_VM_IP")
echo ""
echo "  Make sure port 3000 is open in your GCP firewall:"
echo "  ─────────────────────────────────────────────"
echo "  1. Go to: https://console.cloud.google.com/networking/firewalls/list"
echo "  2. Create rule: allow-tcp-3000"
echo "     - Targets: All instances (or your VM's tag)"
echo "     - Source IP ranges: 0.0.0.0/0"
echo "     - Specified protocols: tcp, port 3000"
echo "  3. Or use gcloud:"
echo "     gcloud compute firewall-rules create allow-eam-3000 \\"
echo "       --allow tcp:3000 \\"
echo "       --source-ranges 0.0.0.0/0 \\"
echo "       --target-tags http-server"
echo ""

# ── Done ──
echo ""
echo "========================================="
echo "  Setup Complete!"
echo "========================================="
echo ""
echo "  App running at: http://${VM_IP}:3000"
echo "  PM2 commands:"
echo "    pm2 logs eam-system    # View logs"
echo "    pm2 restart eam-system # Restart app"
echo "    pm2 stop eam-system    # Stop app"
echo "    pm2 monit              # Monitor"
echo ""
echo "  Next steps for auto-deploy:"
echo "    1. Go to: https://github.com/christianagbotah/eam-system/settings/secrets/actions"
echo "    2. Add these secrets:"
echo "       VM_HOST  = ${VM_IP}"
echo "       VM_USER  = $(whoami)"
echo "       VM_SSH_KEY = (paste your SSH private key)"
echo "       VM_PORT  = 22"
echo ""
echo "  After adding secrets, every push to 'main' will auto-deploy!"
echo ""
