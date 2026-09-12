#!/usr/bin/env bash
set -euo pipefail

: "${RELEASE_SHA:?RELEASE_SHA is required}"

APP_LINK="${DEPLOY_PATH:-/home/lightworld/webapps/iassetspro}"
RELEASES_DIR="${RELEASES_DIR:-/home/lightworld/releases}"
PROD_PORT="${PRODUCTION_PORT:-3001}"
PUBLIC_URL="${PRODUCTION_URL:-https://iassetspro.lightworldtech.com}"
PM2_NAME="${PM2_NAME:-iassetspro}"
CANARY_NAME="${CANARY_NAME:-iassetspro-deploy-canary}"
BACKUP_DIR="${BACKUP_DIR:-/home/lightworld/backups/iassetspro}"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "STOP: production deployment must run as root."
  exit 1
fi

for cmd in git node bun pm2 curl ss df find cp mv rm gzip getent awk grep; do
  command -v "$cmd" >/dev/null || { echo "STOP: missing required command: $cmd"; exit 1; }
done

OLD_RELEASE="$(readlink -f "$APP_LINK")"
[[ -n "$OLD_RELEASE" && -d "$OLD_RELEASE/.git" ]] || {
  echo "STOP: active release is not a Git checkout: $OLD_RELEASE"
  exit 1
}

REPO_URL="$(git -C "$OLD_RELEASE" remote get-url origin)"
STAMP="$(date +%Y%m%d-%H%M%S)"
NEW_RELEASE="${RELEASES_DIR}/iassetspro-${RELEASE_SHA:0:12}-${STAMP}"
HOSTS_BACKUP="/tmp/iassetspro-hosts-${STAMP}"
CANARY_PORT=""
RECONCILIATION_STARTED=0
OLD_RUNTIME_POST_MIGRATION_OK=0

health_check() {
  local url="$1"
  local outfile="$2"
  local attempts="${3:-18}"
  local wait_seconds="${4:-5}"
  local code=""

  for i in $(seq 1 "$attempts"); do
    code="$(curl -sS -o "$outfile" -w '%{http_code}' --max-time 10 "$url" 2>/dev/null || true)"
    echo "Health attempt $i/$attempts -> HTTP ${code:-000}"
    [[ "$code" == "200" ]] && return 0
    sleep "$wait_seconds"
  done
  return 1
}

restore_hosts() {
  if [[ -f "$HOSTS_BACKUP" ]]; then
    cp -a "$HOSTS_BACKUP" /etc/hosts
    rm -f "$HOSTS_BACKUP"
  fi
}

cleanup_canary() {
  pm2 delete "$CANARY_NAME" >/dev/null 2>&1 || true
  restore_hosts
}
trap cleanup_canary EXIT INT TERM

pin_registry_ipv4() {
  local ipv4
  ipv4="$(getent ahostsv4 registry.npmjs.org | awk 'NR==1{print $1}')"
  [[ -n "$ipv4" ]] || {
    echo "STOP: registry.npmjs.org has no IPv4 result."
    exit 1
  }

  cp -a /etc/hosts "$HOSTS_BACKUP"
  printf '\n%s registry.npmjs.org # iassetspro-deploy-temp-ipv4\n' "$ipv4" >> /etc/hosts

  curl -fsSI --max-time 10 https://registry.npmjs.org/ >/dev/null
  bun -e 'fetch("https://registry.npmjs.org/").then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))'
}

rollback_runtime() {
  if [[ "$RECONCILIATION_STARTED" == "1" ]]; then
    echo "ROLLBACK REFUSED: lifecycle reconciliation has started; keep the new runtime active for investigation."
    return 1
  fi

  if [[ "$OLD_RUNTIME_POST_MIGRATION_OK" != "1" ]]; then
    echo "ROLLBACK REFUSED: old runtime was not verified healthy against the post-migration schema."
    return 1
  fi

  echo "ROLLBACK: restoring previous runtime $OLD_RELEASE"
  pm2 delete "$PM2_NAME" >/dev/null 2>&1 || true
  sleep 2

  ln -sfn "$OLD_RELEASE" "${APP_LINK}.rollback"
  mv -Tf "${APP_LINK}.rollback" "$APP_LINK"

  PORT="$PROD_PORT" HOSTNAME=127.0.0.1 NODE_ENV=production \
    pm2 start "$OLD_RELEASE/.next/standalone/server.js" \
      --name "$PM2_NAME" --cwd "$OLD_RELEASE" \
      --node-args="--env-file=$OLD_RELEASE/.env" --time

  health_check "http://127.0.0.1:${PROD_PORT}/api/health" \
    /tmp/iassetspro-rollback-health.json 18 5 || {
      pm2 logs "$PM2_NAME" --lines 100 --nostream || true
      return 1
    }

  pm2 save
  echo "ROLLBACK COMPLETE"
}

echo "============================================================"
echo " iAssetsPro — RELEASE-BASED PRODUCTION DEPLOYMENT"
echo "============================================================"
echo "Release SHA : $RELEASE_SHA"
echo "Active      : $OLD_RELEASE"
echo "Target      : $NEW_RELEASE"

echo
echo "[1/12] Verify active production"
health_check "http://127.0.0.1:${PROD_PORT}/api/health" \
  /tmp/iassetspro-predeploy-health.json 3 2 || {
    echo "STOP: current production is unhealthy."
    exit 1
  }

echo
echo "[2/12] Fetch and materialize exact main commit"
git -C "$OLD_RELEASE" fetch origin main
git -C "$OLD_RELEASE" cat-file -e "${RELEASE_SHA}^{commit}"

REMOTE_MAIN="$(git -C "$OLD_RELEASE" rev-parse origin/main)"
[[ "$REMOTE_MAIN" == "$RELEASE_SHA" ]] || {
  echo "STOP: requested release SHA is not current origin/main."
  echo "origin/main: $REMOTE_MAIN"
  exit 1
}

[[ ! -e "$NEW_RELEASE" ]] || {
  echo "STOP: target release already exists: $NEW_RELEASE"
  exit 1
}

git clone --no-hardlinks --no-checkout "$OLD_RELEASE" "$NEW_RELEASE"
git -C "$NEW_RELEASE" remote set-url origin "$REPO_URL"
git -C "$NEW_RELEASE" checkout --detach "$RELEASE_SHA"
cp -a "$OLD_RELEASE/.env" "$NEW_RELEASE/.env"

echo
echo "[3/12] Prepare dependencies and build"
cd "$NEW_RELEASE"

if [[ -d "$OLD_RELEASE/node_modules" ]] && \
   cmp -s "$OLD_RELEASE/package.json" "$NEW_RELEASE/package.json" && \
   cmp -s "$OLD_RELEASE/bun.lock" "$NEW_RELEASE/bun.lock"; then
  echo "Reusing dependency tree because package.json and bun.lock are unchanged."
  cp -a "$OLD_RELEASE/node_modules" "$NEW_RELEASE/node_modules"
else
  echo "Dependency graph changed or reusable node_modules is unavailable."
  echo "Temporarily forcing npm registry resolution over IPv4 for Bun."
  pin_registry_ipv4
  bun install --frozen-lockfile
  restore_hosts
fi

bunx prisma generate
rm -rf .next
bun run build
test -f .next/standalone/server.js
test -f scripts/seed-transitions.ts

echo
echo "[4/12] Pre-cutover RWOP driver/schema checks"
NODE_ENV=production bun run scripts/seed-transitions.ts --check-driver
NODE_ENV=production bun run scripts/seed-transitions.ts --check-schema

echo
echo "[5/12] Check and apply pending Prisma migrations"
set +e
MIGRATION_STATUS="$(bunx prisma migrate status 2>&1)"
MIGRATION_STATUS_RC=$?
set -e
printf '%s\n' "$MIGRATION_STATUS"

if grep -q "Database schema is up to date" <<<"$MIGRATION_STATUS"; then
  echo "No pending migrations."
elif grep -Eq "not yet been applied|have not yet been applied|Following migration" <<<"$MIGRATION_STATUS"; then
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"

  DUMP_BIN="$(command -v mariadb-dump || command -v mysqldump || true)"
  [[ -n "$DUMP_BIN" ]] || { echo "STOP: mariadb-dump/mysqldump unavailable."; exit 1; }

  DB_HOST="$(node --env-file="$NEW_RELEASE/.env" -e 'const u=new URL(process.env.DATABASE_URL); process.stdout.write(u.hostname)')"
  DB_PORT="$(node --env-file="$NEW_RELEASE/.env" -e 'const u=new URL(process.env.DATABASE_URL); process.stdout.write(u.port || "3306")')"
  DB_USER="$(node --env-file="$NEW_RELEASE/.env" -e 'const u=new URL(process.env.DATABASE_URL); process.stdout.write(decodeURIComponent(u.username))')"
  DB_PASS="$(node --env-file="$NEW_RELEASE/.env" -e 'const u=new URL(process.env.DATABASE_URL); process.stdout.write(decodeURIComponent(u.password))')"
  DB_NAME="$(node --env-file="$NEW_RELEASE/.env" -e 'const u=new URL(process.env.DATABASE_URL); process.stdout.write(decodeURIComponent(u.pathname.replace(/^\//,"")))')"

  BACKUP="${BACKUP_DIR}/pre-deploy-${RELEASE_SHA:0:12}-${STAMP}.sql.gz"
  MYSQL_PWD="$DB_PASS" "$DUMP_BIN" \
    --host="$DB_HOST" --port="$DB_PORT" --user="$DB_USER" \
    --single-transaction --quick --hex-blob "$DB_NAME" | gzip -1 > "$BACKUP"
  unset DB_PASS

  test -s "$BACKUP"
  gzip -t "$BACKUP"
  echo "Verified pre-migration backup: $BACKUP"

  bunx prisma migrate deploy
  bunx prisma migrate status
else
  echo "STOP: Prisma migration status could not be classified safely (exit $MIGRATION_STATUS_RC)."
  exit 1
fi

if health_check "http://127.0.0.1:${PROD_PORT}/api/health" \
    /tmp/iassetspro-old-postmigration-health.json 3 2; then
  OLD_RUNTIME_POST_MIGRATION_OK=1
else
  echo "STOP: old production runtime is unhealthy after migration. No cutover performed."
  exit 1
fi

echo
echo "[6/12] Start and validate isolated canary"
for p in $(seq 3100 3199); do
  if ! ss -ltnH | awk '{print $4}' | grep -Eq "[:.]${p}$"; then
    CANARY_PORT="$p"
    break
  fi
done
[[ -n "$CANARY_PORT" ]] || { echo "STOP: no free canary port."; exit 1; }

pm2 delete "$CANARY_NAME" >/dev/null 2>&1 || true
PORT="$CANARY_PORT" HOSTNAME=127.0.0.1 NODE_ENV=production \
  pm2 start "$NEW_RELEASE/.next/standalone/server.js" \
    --name "$CANARY_NAME" --cwd "$NEW_RELEASE" \
    --node-args="--env-file=$NEW_RELEASE/.env" --time

health_check "http://127.0.0.1:${CANARY_PORT}/api/health" \
  /tmp/iassetspro-canary-health.json 18 5 || {
    pm2 logs "$CANARY_NAME" --lines 100 --nostream || true
    echo "STOP: canary failed; existing production remains active."
    exit 1
  }
pm2 delete "$CANARY_NAME" >/dev/null 2>&1 || true

echo
echo "[7/12] Cut over symlink and PM2"
pm2 delete "$PM2_NAME" >/dev/null 2>&1 || true
sleep 2

if ss -ltnH | awk '{print $4}' | grep -Eq "[:.]${PROD_PORT}$"; then
  echo "Production port ${PROD_PORT} is still occupied."
  ss -ltnp | grep ":${PROD_PORT}" || true
  rollback_runtime || true
  exit 1
fi

ln -sfn "$NEW_RELEASE" "${APP_LINK}.new"
mv -Tf "${APP_LINK}.new" "$APP_LINK"

PORT="$PROD_PORT" HOSTNAME=127.0.0.1 NODE_ENV=production \
  pm2 start "$NEW_RELEASE/.next/standalone/server.js" \
    --name "$PM2_NAME" --cwd "$NEW_RELEASE" \
    --node-args="--env-file=$NEW_RELEASE/.env" --time

if ! health_check "http://127.0.0.1:${PROD_PORT}/api/health" \
    /tmp/iassetspro-new-production-health.json 18 5; then
  pm2 logs "$PM2_NAME" --lines 100 --nostream || true
  rollback_runtime || true
  exit 1
fi

echo
echo "[8/12] Reconcile canonical lifecycle transitions"
RECONCILIATION_STARTED=1
cd "$NEW_RELEASE"
if ! NODE_ENV=production bun run scripts/seed-transitions.ts; then
  echo "STOP: transition reconciliation failed."
  echo "The new runtime remains active; automatic rollback is disabled once reconciliation starts."
  exit 1
fi

echo
echo "[9/12] Post-reconciliation local/public smoke tests"
health_check "http://127.0.0.1:${PROD_PORT}/api/health" \
  /tmp/iassetspro-postreconcile-health.json 12 5 || {
    pm2 logs "$PM2_NAME" --lines 120 --nostream || true
    echo "STOP: local health failed after reconciliation; new runtime remains active."
    exit 1
  }

health_check "${PUBLIC_URL}/api/health" \
  /tmp/iassetspro-public-health.json 12 10 || {
    echo "STOP: public smoke failed after reconciliation; no automatic rollback."
    exit 1
  }

pm2 save

echo
echo "[10/12] Success-only release/temp cleanup"
echo "Disk before cleanup:"
df -h /

while IFS= read -r -d '' dir; do
  real="$(readlink -f "$dir")"
  [[ -n "$real" ]] || continue

  if [[ "$real" == "$NEW_RELEASE" ]]; then
    echo "KEEP active   : $real"
    continue
  fi
  if [[ "$real" == "$OLD_RELEASE" ]]; then
    echo "KEEP rollback : $real"
    continue
  fi

  case "$real" in
    "$RELEASES_DIR"/iassetspro-*)
      echo "REMOVE obsolete: $real"
      rm -rf --one-file-system "$real"
      ;;
    *)
      echo "SKIP unexpected path: $real"
      ;;
  esac
done < <(
  find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -name 'iassetspro-*' -print0
)

for release in "$NEW_RELEASE" "$OLD_RELEASE"; do
  rm -rf \
    "$release/.next/cache" \
    "$release/.deploy-rollback" \
    "$release/playwright-report" \
    "$release/test-results" \
    "$release/coverage"
done

# Deployment-owned health/hosts artifacts are regular files. Do not let the
# broad iassetspro-* pattern descend into or complain about validation worktrees
# that may also live under /tmp.
find /tmp -mindepth 1 -maxdepth 1 -type f -name 'iassetspro-*' -delete || true

echo "Disk after cleanup:"
df -h /

echo
echo "[11/12] Verify retention and authoritative release"
ACTIVE="$(readlink -f "$APP_LINK")"
[[ "$ACTIVE" == "$NEW_RELEASE" ]] || {
  echo "STOP: active symlink is not the new release."
  exit 1
}
[[ "$(git -C "$ACTIVE" rev-parse HEAD)" == "$RELEASE_SHA" ]] || {
  echo "STOP: active release SHA mismatch."
  exit 1
}

RELEASE_COUNT="$(find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -name 'iassetspro-*' | wc -l)"
[[ "$RELEASE_COUNT" -eq 2 ]] || {
  echo "STOP: expected exactly 2 retained iAssetsPro releases, found $RELEASE_COUNT."
  find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -name 'iassetspro-*' -print
  exit 1
}

echo
echo "[12/12] Final health"
health_check "http://127.0.0.1:${PROD_PORT}/api/health" \
  /tmp/iassetspro-final-local.json 3 2
health_check "${PUBLIC_URL}/api/health" \
  /tmp/iassetspro-final-public.json 3 3

pm2 status "$PM2_NAME"
pm2 save

echo "============================================================"
echo " iAssetsPro DEPLOYMENT SUCCESSFUL"
echo " Active  : $NEW_RELEASE"
echo " Rollback: $OLD_RELEASE"
echo " SHA     : $RELEASE_SHA"
echo "============================================================"
