#!/bin/bash
# =============================================================================
# EAM System - One-Time Webuzo VPS Setup Script
# =============================================================================
# Run this script ONCE on your Webuzo VPS to prepare it for auto-deploy.
#
# This script will:
#   1. Check/install Node.js 20+ (if Webuzo doesn't have it)
#   2. Install PM2 process manager
#   3. Create swap space (2GB) to prevent OOM crashes
#   4. Clone the repo from GitHub
#   5. Guide you through .env setup (database URL, auth secret)
#   6. Install dependencies and build the app
#   7. Set up PM2 to auto-start the app on VPS reboot
#   8. Guide you through Webuzo reverse proxy setup
#
# USAGE:
#   Option A: SSH into your VPS and paste this:
#     curl -fsSL https://raw.githubusercontent.com/christianagbotah/eam-system/main/scripts/webuzo-setup.sh | bash
#
#   Option B: Copy the script to VPS and run:
#     chmod +x webuzo-setup.sh && ./webuzo-setup.sh
#
# PREREQUISITES:
#   - Webuzo panel already installed and running
#   - SSH access to the VPS
#   - PostgreSQL database created (via Webuzo panel)
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log_info()  { echo -e "${GREEN}[✓]${NC} $1"; }
log_warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
log_error() { echo -e "${RED}[✗]${NC} $1"; }
log_step()  { echo -e "\n${BLUE}── $1 ──${NC}"; }

echo ""
echo "========================================="
echo "  EAM System - Webuzo VPS Setup"
echo "  $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "========================================="

# ── Step 0: Check prerequisites ──
log_step "Step 0: Checking prerequisites"

if ! command -v node &> /dev/null; then
    log_warn "Node.js not found!"
    echo ""
    echo "  Install Node.js via Webuzo Panel:"
    echo "  1. Log into Webuzo at https://YOUR_VPS_IP:2002"
    echo "  2. Go to: Apps > Install Applications"
    echo "  3. Search for 'Node.js' and install Node.js 20+"
    echo "  4. After installation, re-run this script"
    echo ""
    exit 1
fi

NODE_VER=$(node --version | cut -d. -f1 | tr -d 'v')
if [ "$NODE_VER" -lt 20 ]; then
    log_warn "Node.js $(node --version) found but v20+ required"
    echo ""
    echo "  Upgrade Node.js via Webuzo Panel:"
    echo "  1. Log into Webuzo at https://YOUR_VPS_IP:2002"
    echo "  2. Go to: Apps > Install Applications"
    echo "  3. Search for 'Node.js' and install Node.js 20+"
    echo ""
    exit 1
fi

log_info "Node.js $(node --version) found"
log_info "npm $(npm --version) found"

# ── Step 1: Create swap space ──
log_step "Step 1: Setting up swap space (2GB)"

if swapon --show | grep -q "/swapfile"; then
    log_info "Swap already configured"
else
    log_info "Creating 2GB swap file..."
    sudo fallocate -l 2G /swapfile 2>/dev/null || sudo dd if=/dev/zero of=/swapfile bs=1M count=2048 status=progress
    sudo chmod 600 /swapfile
    sudo mkswap /swapfile
    sudo swapon /swapfile
    echo "/swapfile none swap sw 0 0" | sudo tee -a /etc/fstab > /dev/null
    log_info "2GB swap created and enabled"
    log_info "This prevents OOM crashes during builds"
fi

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

# ── Step 4: Create .env ──
log_step "Step 4: Environment configuration"

if [ -f .env ]; then
    log_info ".env file found"
    echo ""
    echo "  Current .env contents (secrets masked):"
    grep -E "^[A-Z_]+=" .env | sed 's/\(.\{8\}\).*/\1.../' | while read line; do
        echo "    $line"
    done
    echo ""
    read -p "  Keep existing .env? (Y/n): " KEEP_ENV
    if [[ "$KEEP_ENV" =~ ^[Nn] ]]; then
        rm .env
        log_info "Old .env removed"
    fi
fi

if [ ! -f .env ]; then
    echo ""
    echo "  ╔══════════════════════════════════════════════╗"
    echo "  ║   DATABASE SETUP REQUIRED                     ║"
    echo "  ╠══════════════════════════════════════════════╣"
    echo "  ║                                              ║"
    echo "  ║  1. Log into Webuzo: https://YOUR_VPS:2002   ║"
    echo "  ║  2. Go to: Databases > PostgreSQL Databases       ║"
    echo "  ║  3. Create a new database:                    ║"
    echo "  ║     - DB Name: eam_system                    ║"
    echo "  ║     - DB User: eam_user                      ║"
    echo "  ║     - DB Password: (choose a strong one)     ║"
    echo "  ║     - Host: localhost                        ║"
    echo "  ║                                              ║"
    echo "  ╚══════════════════════════════════════════════╝"
    echo ""

    read -p "  Enter PostgreSQL host (default: localhost): " DB_HOST
    DB_HOST=${DB_HOST:-localhost}

    read -p "  Enter PostgreSQL port (default: 5432): " DB_PORT
    DB_PORT=${DB_PORT:-5432}

    read -p "  Enter PostgreSQL database name: " DB_NAME
    while [ -z "$DB_NAME" ]; do
        echo -e "${RED}  Database name is required!${NC}"
        read -p "  Enter PostgreSQL database name: " DB_NAME
    done

    read -p "  Enter PostgreSQL username: " DB_USER
    while [ -z "$DB_USER" ]; do
        echo -e "${RED}  Username is required!${NC}"
        read -p "  Enter PostgreSQL username: " DB_USER
    done

    read -sp "  Enter PostgreSQL password: " DB_PASS
    while [ -z "$DB_PASS" ]; do
        echo ""
        echo -e "${RED}  Password is required!${NC}"
        read -sp "  Enter PostgreSQL password: " DB_PASS
    done
    echo ""

    AUTH_SECRET=$(openssl rand -hex 32)

    cat > .env << EOF
# EAM System - Production Environment
DATABASE_URL="postgresql://${DB_USER}:${DB_PASS}@${DB_HOST}:${DB_PORT}/${DB_NAME}"
NEXTAUTH_SECRET="${AUTH_SECRET}"
NEXTAUTH_URL="http://localhost:3000"
NEXT_TELEMETRY_DISABLED=1
NODE_ENV=production
EOF

    chmod 600 .env
    log_info ".env file created"
fi

# ── Step 5: Install dependencies and build ──
log_step "Step 5: Installing dependencies"

npm install --legacy-peer-deps 2>&1 | tail -5
log_info "Dependencies installed"

log_info "Copying prebuilt Prisma client..."
if [ -d "prisma/prebuilt/.prisma" ]; then
    cp -r prisma/prebuilt/.prisma node_modules/.prisma
    log_info "Prebuilt Prisma client copied"
else
    npx prisma generate
    log_info "Prisma client generated"
fi

log_info "Pushing database schema..."
npx prisma db push --accept-data-loss 2>&1 | tail -5
log_info "Database schema pushed"

log_info "Building Next.js (this may take 2-5 minutes on small VPS)..."
export NEXT_TELEMETRY_DISABLED=1
npx next build 2>&1 | tail -10
log_info "Build complete"

log_info "Copying static assets..."
cp -r node_modules/.prisma/client .next/standalone/node_modules/.prisma/client
cp -r node_modules/@prisma/adapter-pg .next/standalone/node_modules/@prisma/adapter-pg 2>/dev/null || true
cp -r node_modules/pg .next/standalone/node_modules/pg 2>/dev/null || true
cp -r .next/static .next/standalone/.next/
cp -r public .next/standalone/

if [ -f "patch-server.js" ]; then
    node patch-server.js
    log_info "Server patched for reverse proxy"
fi

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
pm2 startup 2>/dev/null | grep "sudo" | head -1 || true

log_info "PM2 status:"
pm2 list

# ── Step 7: Health check ──
log_step "Step 7: Health check"

sleep 5
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ --max-time 10 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "302" ] || [ "$HTTP_CODE" = "307" ]; then
    log_info "App is running (HTTP $HTTP_CODE)"
else
    log_warn "App returned HTTP $HTTP_CODE - check logs with: pm2 logs eam-system"
fi

# ── Step 8: Webuzo reverse proxy setup ──
VPS_IP=$(curl -s ifconfig.me 2>/dev/null || echo "YOUR_VPS_IP")

log_step "Step 8: Webuzo Reverse Proxy Setup"
echo ""
echo "  ╔══════════════════════════════════════════════╗"
echo "  ║   REVERSE PROXY SETUP (Webuzo Panel)        ║"
echo "  ╠══════════════════════════════════════════════╣"
echo "  ║                                              ║"
echo "  ║  The app is running on port 3000.            ║"
echo "  ║  You need to set up a reverse proxy in       ║"
echo "  ║  Webuzo to route traffic from port 80/443    ║"
echo "  ║  to the Node.js app.                         ║"
echo "  ║                                              ║"
echo "  ║  OPTION A: Webuzo Node.js Manager            ║"
echo "  ║  ─────────────────────────────               ║"
echo "  ║  1. Log into Webuzo: https://${VPS_IP}:2002"
echo "  ║  2. Go to: Apps > Node.js                    ║"
echo "  ║  3. Click 'Add Instance'                      ║"
echo "  ║  4. Set:                                     ║"
echo "  ║     - App Name: eam-system                   ║"
echo "  ║     - App Root: $REPO_DIR"
echo "  ║     - Startup File: .next/standalone/server.js"
echo "  ║     - Run as: $(whoami)"
echo "  ║     - Port: 3000                              ║"
echo "  ║  5. Select your domain and enable it         ║"
echo "  ║                                              ║"
echo "  ║  OPTION B: Apache Reverse Proxy (.htaccess)  ║"
echo "  ║  ─────────────────────────────               ║"
echo "  ║  1. In Webuzo, create a domain for the app   ║"
echo "  ║  2. SSH in and add to the domain's vhost:    ║"
echo "  ║                                              ║"
echo "  ║     ProxyPreserveHost On                     ║"
echo "  ║     ProxyPass / http://127.0.0.1:3000/       ║"
echo "  ║     ProxyPassReverse / http://127.0.0.1:3000/"
echo "  ║     RewriteEngine On                         ║"
echo "  ║     RewriteCond %{HTTP:Upgrade} websocket    ║"
echo "  ║     RewriteCond %{HTTP:Connection} upgrade   ║"
echo "  ║     RewriteRule ^(.*) ws://127.0.0.1:3000/\$1 [P,L]"
echo "  ║                                              ║"
echo "  ║  OPTION C: Nginx Reverse Proxy               ║"
echo "  ║  ─────────────────────────────               ║"
echo "  ║  1. In Webuzo, go to: Settings > Nginx       ║"
echo "  ║  2. Add to server block:                     ║"
echo "  ║                                              ║"
echo "  ║     location / {                             ║"
echo "  ║         proxy_pass http://127.0.0.1:3000;    ║"
echo "  ║         proxy_http_version 1.1;               ║"
echo "  ║         proxy_set_header Upgrade \$http_upgrade;"
echo "  ║         proxy_set_header Connection          ║"
echo "  ║           'upgrade';                         ║"
echo "  ║         proxy_set_header Host \$host;          ║"
echo "  ║         proxy_set_header X-Real-IP            ║"
echo "  ║           \$remote_addr;                       ║"
echo "  ║         proxy_set_header X-Forwarded-For      ║"
echo "  ║           \$proxy_add_x_forwarded_for;         ║"
echo "  ║         proxy_set_header X-Forwarded-Proto    ║"
echo "  ║           \$scheme;                           ║"
echo "  ║         client_max_body_size 10M;             ║"
echo "  ║     }                                         ║"
echo "  ║                                              ║"
echo "  ╚══════════════════════════════════════════════╝"
echo ""

# ── Step 9: NEXTAUTH_URL reminder ──
log_step "Important: Update NEXTAUTH_URL"
echo ""
echo "  After setting up your domain in Webuzo, update .env:"
echo "  ─────────────────────────────────────────────"
echo "  nano $REPO_DIR/.env"
echo ""
echo "  Change: NEXTAUTH_URL=\"http://localhost:3000\""
echo "  To:     NEXTAUTH_URL=\"https://yourdomain.com\""
echo ""
echo "  Then restart: pm2 restart eam-system"
echo ""

# ── Done ──
echo "========================================="
echo "  Setup Complete!"
echo "========================================="
echo ""
echo "  App running at: http://localhost:3000"
echo "  PM2 commands:"
echo "    pm2 logs eam-system    # View logs"
echo "    pm2 restart eam-system # Restart app"
echo "    pm2 stop eam-system    # Stop app"
echo "    pm2 monit              # Monitor"
echo ""
echo "  Next steps for auto-deploy:"
echo "    1. Go to: https://github.com/christianagbotah/eam-system/settings/secrets/actions"
echo "    2. Add these secrets:"
echo "       VPS_HOST      = ${VPS_IP}"
echo "       VPS_USER      = $(whoami)"
echo "       VPS_SSH_KEY   = (paste your SSH private key)"
echo "       VPS_PORT      = 22"
echo "       VPS_APP_PATH  = $REPO_DIR"
echo ""
echo "  After adding secrets, every push to 'main' will auto-deploy!"
echo ""
