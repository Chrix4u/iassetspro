#!/usr/bin/env bash
set -euo pipefail

SHA="${1:-}"
ARTIFACT="${2:-}"
CHECKSUM="${3:-}"

APP_LINK="${DEPLOY_PATH:-/home/lightworld/webapps/iassetspro}"
RELEASES_DIR="${RELEASES_DIR:-/home/lightworld/releases}"
PROD_PORT="${PRODUCTION_PORT:-3001}"
PUBLIC_URL="${PRODUCTION_URL:-https://iassetspro.lightworldtech.com}"
PM2_NAME="${PM2_NAME:-iassetspro}"
CANARY_NAME="${CANARY_NAME:-iassetspro-deploy-canary}"
BACKUP_DIR="${BACKUP_DIR:-/home/lightworld/backups/iassetspro}"
INBOX_ROOT="${INBOX_ROOT:-/home/iassetsdeploy/incoming}"

[[ "$(id -u)" -eq 0 ]] || { echo "STOP: root is required"; exit 1; }
install -d -m 755 /run/lock
exec 9>/run/lock/iassetspro-deploy.lock
flock -n 9 || { echo "STOP: another iAssetsPro deployment is active"; exit 1; }
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo "STOP: invalid release SHA"; exit 1; }
[[ -f "$ARTIFACT" && -f "$CHECKSUM" ]] || { echo "STOP: artifact/checksum missing"; exit 1; }
case "$(readlink -f "$ARTIFACT")" in "$INBOX_ROOT"/*) ;; *) echo "STOP: artifact outside deployment inbox"; exit 1;; esac
case "$(readlink -f "$CHECKSUM")" in "$INBOX_ROOT"/*) ;; *) echo "STOP: checksum outside deployment inbox"; exit 1;; esac

for cmd in node bun pm2 curl ss df find cp mv rm gzip tar sha256sum awk grep flock; do
  command -v "$cmd" >/dev/null || { echo "STOP: missing command: $cmd"; exit 1; }
done

OLD_RELEASE="$(readlink -f "$APP_LINK")"
[[ -n "$OLD_RELEASE" && -d "$OLD_RELEASE" ]] || { echo "STOP: active release missing"; exit 1; }
STAMP="$(date +%Y%m%d-%H%M%S)"
NEW_RELEASE="${RELEASES_DIR}/iassetspro-${SHA:0:12}-${STAMP}"
CANARY_PORT=""
RECONCILIATION_STARTED=0
OLD_RUNTIME_POST_MIGRATION_OK=0
CUTOVER_DONE=0

entrypoint_for() {
  local release="$1"
  if [[ -f "$release/server.js" ]]; then
    printf '%s\n' "$release/server.js"
  elif [[ -f "$release/.next/standalone/server.js" ]]; then
    printf '%s\n' "$release/.next/standalone/server.js"
  else
    return 1
  fi
}

health_check() {
  local url="$1" outfile="$2" attempts="${3:-18}" wait_seconds="${4:-5}" code=""
  for i in $(seq 1 "$attempts"); do
    code="$(curl -sS -o "$outfile" -w '%{http_code}' --max-time 10 "$url" 2>/dev/null || true)"
    echo "Health attempt $i/$attempts -> HTTP ${code:-000}"
    [[ "$code" == "200" ]] && return 0
    sleep "$wait_seconds"
  done
  return 1
}

cleanup_canary() {
  pm2 delete "$CANARY_NAME" >/dev/null 2>&1 || true
  if [[ "$CUTOVER_DONE" == "0" && -n "${NEW_RELEASE:-}" && -d "$NEW_RELEASE" ]]; then
    rm -rf --one-file-system "$NEW_RELEASE"
  fi
}
trap cleanup_canary EXIT INT TERM

rollback_runtime() {
  [[ "$CUTOVER_DONE" == "1" ]] || return 0
  if [[ "$OLD_RUNTIME_POST_MIGRATION_OK" != "1" ]]; then
    echo "ROLLBACK REFUSED: old runtime was not verified after migration"
    return 1
  fi

  local old_entry
  old_entry="$(entrypoint_for "$OLD_RELEASE")" || return 1
  echo "ROLLBACK: $OLD_RELEASE"
  pm2 delete "$PM2_NAME" >/dev/null 2>&1 || true
  ln -sfn "$OLD_RELEASE" "${APP_LINK}.rollback"
  mv -Tf "${APP_LINK}.rollback" "$APP_LINK"
  PORT="$PROD_PORT" HOSTNAME=127.0.0.1 NODE_ENV=production \
    pm2 start "$old_entry" --name "$PM2_NAME" --cwd "$OLD_RELEASE" \
      --node-args="--env-file=$OLD_RELEASE/.env" --time
  health_check "http://127.0.0.1:${PROD_PORT}/api/health" /tmp/iassetspro-rollback-health.json 18 5
  pm2 save
  CUTOVER_DONE=0
  echo "ROLLBACK COMPLETE"
}

echo "============================================================"
echo " iAssetsPro — GITHUB ARTIFACT DEPLOYMENT"
echo "============================================================"
echo "SHA      : $SHA"
echo "Active   : $OLD_RELEASE"
echo "Artifact : $ARTIFACT"

echo "[1/10] Verify current production and artifact"
health_check "http://127.0.0.1:${PROD_PORT}/api/health" /tmp/iassetspro-predeploy-health.json 3 2 || {
  echo "STOP: current production is unhealthy"; exit 1;
}
(
  cd "$(dirname "$ARTIFACT")"
  sha256sum -c "$(basename "$CHECKSUM")"
)

echo "Validating archive member paths and types"
tar -tzf "$ARTIFACT" | awk '
  /^\// || /(^|\/)\.\.($|\/)/ || /\\/ {
    print "STOP: unsafe archive path: " $0 > "/dev/stderr"
    bad=1
  }
  END { exit bad }
'
tar -tvzf "$ARTIFACT" | awk '
  substr($1,1,1) == "l" || substr($1,1,1) == "h" {
    print "STOP: archive links are forbidden: " $0 > "/dev/stderr"
    bad=1
  }
  END { exit bad }
'

[[ ! -e "$NEW_RELEASE" ]] || { echo "STOP: release path already exists"; exit 1; }
mkdir -p "$NEW_RELEASE"
tar --extract --gzip --file "$ARTIFACT" --directory "$NEW_RELEASE" \
  --no-same-owner --no-same-permissions --delay-directory-restore
[[ "$(tr -d '\r\n' < "$NEW_RELEASE/RELEASE_SHA")" == "$SHA" ]] || { echo "STOP: embedded SHA mismatch"; exit 1; }
NEW_ENTRY="$(entrypoint_for "$NEW_RELEASE")" || { echo "STOP: runtime entrypoint missing"; exit 1; }
PRISMA_CLI="$NEW_RELEASE/node_modules/prisma/build/index.js"
test -f "$PRISMA_CLI"
test -f "$NEW_RELEASE/node_modules/prisma/build/prisma_schema_build_bg.wasm"
test -f "$NEW_RELEASE/prisma/schema.prisma"
test -d "$NEW_RELEASE/prisma/migrations"
test -f "$NEW_RELEASE/scripts/seed-transitions.ts"
test -f "$NEW_RELEASE/scripts/bootstrap-postgresql-staging.sh"
test -f "$NEW_RELEASE/prisma/seed-constants.ts"
test -f "$NEW_RELEASE/prisma/seed-permissions-only.ts"
test -f "$NEW_RELEASE/prisma/seed-trades.ts"
test -f "$NEW_RELEASE/src/lib/create-postgres-adapter.ts"
cp -a "$OLD_RELEASE/.env" "$NEW_RELEASE/.env"
chmod 600 "$NEW_RELEASE/.env"

echo "[2/10] PostgreSQL staging bootstrap and driver preflight"
bash "$NEW_RELEASE/scripts/bootstrap-postgresql-staging.sh" "$NEW_RELEASE/.env"
cd "$NEW_RELEASE"
NODE_ENV=production bun --env-file=.env run scripts/seed-transitions.ts --check-driver

DB_HOST="$(node --env-file=.env -e 'const u=new URL(process.env.DATABASE_URL);process.stdout.write(u.hostname)')"
DB_PORT="$(node --env-file=.env -e 'const u=new URL(process.env.DATABASE_URL);process.stdout.write(u.port||"5432")')"
DB_USER="$(node --env-file=.env -e 'const u=new URL(process.env.DATABASE_URL);process.stdout.write(decodeURIComponent(u.username))')"
DB_PASS="$(node --env-file=.env -e 'const u=new URL(process.env.DATABASE_URL);process.stdout.write(decodeURIComponent(u.password))')"
DB_NAME="$(node --env-file=.env -e 'const u=new URL(process.env.DATABASE_URL);process.stdout.write(decodeURIComponent(u.pathname.replace(/^\//,"")))')"

echo "[3/10] PostgreSQL migration classification"
set +e
MIGRATION_STATUS="$(node "$PRISMA_CLI" migrate status 2>&1)"
MIGRATION_RC=$?
set -e
printf '%s\n' "$MIGRATION_STATUS"

NEEDS_MIGRATION=0
if grep -q "Database schema is up to date" <<<"$MIGRATION_STATUS"; then
  echo "No pending PostgreSQL migrations"
elif grep -Eq "not yet been applied|have not yet been applied|Following migration" <<<"$MIGRATION_STATUS"; then
  NEEDS_MIGRATION=1
else
  echo "STOP: PostgreSQL migration status unclassified (exit $MIGRATION_RC)"
  exit 1
fi

if [[ "$NEEDS_MIGRATION" -eq 1 ]]; then
  command -v pg_dump >/dev/null || { echo "STOP: pg_dump is required for PostgreSQL deployment backups"; exit 1; }
  command -v pg_restore >/dev/null || { echo "STOP: pg_restore is required to verify PostgreSQL backups"; exit 1; }
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  BACKUP="${BACKUP_DIR}/pre-deploy-${SHA:0:12}-${STAMP}.pgdump"
  PGPASSWORD="$DB_PASS" pg_dump \
    --host="$DB_HOST" --port="$DB_PORT" --username="$DB_USER" \
    --format=custom --no-owner --no-privileges \
    --file="$BACKUP" "$DB_NAME"
  test -s "$BACKUP"
  pg_restore --list "$BACKUP" >/dev/null
  chmod 600 "$BACKUP"
  echo "Verified PostgreSQL backup: $BACKUP"
  node "$PRISMA_CLI" migrate deploy
  node "$PRISMA_CLI" migrate status
fi

NODE_ENV=production bun --env-file=.env run scripts/seed-transitions.ts --check-schema

USER_COUNT="$(PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -Atqc 'SELECT COUNT(*) FROM "users"')"
if [[ "$USER_COUNT" == "0" ]]; then
  echo "Clean PostgreSQL staging detected; bootstrapping reference data and enforcing empty operational state"
  NODE_ENV=production bun --env-file=.env run prisma/seed-constants.ts
else
  echo "PostgreSQL staging already commissioned; refreshing non-destructive reference/RBAC data"
  NODE_ENV=production bun --env-file=.env run prisma/seed-reference-data.ts
fi
unset DB_PASS

health_check "http://127.0.0.1:${PROD_PORT}/api/health" /tmp/iassetspro-old-postmigration.json 3 2 || {
  echo "STOP: current active runtime became unhealthy before cutover"; exit 1;
}
OLD_RUNTIME_POST_MIGRATION_OK=1

echo "[4/10] Canary"
for p in $(seq 3100 3199); do
  if ! ss -ltnH | awk '{print $4}' | grep -Eq "[:.]${p}$"; then CANARY_PORT="$p"; break; fi
done
[[ -n "$CANARY_PORT" ]] || { echo "STOP: no canary port"; exit 1; }
pm2 delete "$CANARY_NAME" >/dev/null 2>&1 || true
PORT="$CANARY_PORT" HOSTNAME=127.0.0.1 NODE_ENV=production \
  pm2 start "$NEW_ENTRY" --name "$CANARY_NAME" --cwd "$NEW_RELEASE" \
    --node-args="--env-file=$NEW_RELEASE/.env" --time
health_check "http://127.0.0.1:${CANARY_PORT}/api/health" /tmp/iassetspro-canary-health.json 18 5 || {
  pm2 logs "$CANARY_NAME" --lines 100 --nostream || true
  echo "STOP: canary failed; existing production unchanged"
  exit 1
}
pm2 delete "$CANARY_NAME" >/dev/null 2>&1 || true

echo "[5/10] PM2 cutover"
pm2 delete "$PM2_NAME" >/dev/null 2>&1 || true
sleep 2
if ss -ltnH | awk '{print $4}' | grep -Eq "[:.]${PROD_PORT}$"; then
  echo "STOP: production port still occupied"
  rollback_runtime || true
  exit 1
fi
ln -sfn "$NEW_RELEASE" "${APP_LINK}.new"
mv -Tf "${APP_LINK}.new" "$APP_LINK"
CUTOVER_DONE=1
PORT="$PROD_PORT" HOSTNAME=127.0.0.1 NODE_ENV=production \
  pm2 start "$NEW_ENTRY" --name "$PM2_NAME" --cwd "$NEW_RELEASE" \
    --node-args="--env-file=$NEW_RELEASE/.env" --time
if ! health_check "http://127.0.0.1:${PROD_PORT}/api/health" /tmp/iassetspro-new-health.json 18 5; then
  pm2 logs "$PM2_NAME" --lines 100 --nostream || true
  rollback_runtime || true
  exit 1
fi

echo "[6/10] Reconcile canonical lifecycle transitions"
RECONCILIATION_STARTED=1
cd "$NEW_RELEASE"
if ! NODE_ENV=production bun --env-file=.env run scripts/seed-transitions.ts; then
  echo "STOP: transition reconciliation failed; rolling back runtime"
  rollback_runtime
  exit 1
fi

echo "[7/10] Local/public smoke"
if ! health_check "http://127.0.0.1:${PROD_PORT}/api/health" /tmp/iassetspro-postreconcile.json 12 5; then
  echo "STOP: post-cutover local health failed; rolling back runtime"
  rollback_runtime
  exit 1
fi
if ! health_check "${PUBLIC_URL}/api/health" /tmp/iassetspro-public-health.json 12 10; then
  echo "STOP: post-cutover public health failed; rolling back runtime"
  rollback_runtime
  exit 1
fi
pm2 save

echo "[8/10] Retain active + immediate rollback only"
while IFS= read -r -d '' dir; do
  real="$(readlink -f "$dir")"
  [[ "$real" == "$NEW_RELEASE" || "$real" == "$OLD_RELEASE" ]] && continue
  case "$real" in "$RELEASES_DIR"/iassetspro-*) rm -rf --one-file-system "$real" ;; esac
done < <(find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -name 'iassetspro-*' -print0)
for release in "$NEW_RELEASE" "$OLD_RELEASE"; do
  rm -rf "$release/.next/cache" "$release/playwright-report" "$release/test-results" "$release/coverage" 2>/dev/null || true
done

echo "[9/10] Verify release retention"
ACTIVE="$(readlink -f "$APP_LINK")"
[[ "$ACTIVE" == "$NEW_RELEASE" ]] || { echo "STOP: active symlink mismatch"; exit 1; }
[[ "$(tr -d '\r\n' < "$ACTIVE/RELEASE_SHA")" == "$SHA" ]] || { echo "STOP: active SHA mismatch"; exit 1; }
RELEASE_COUNT="$(find "$RELEASES_DIR" -mindepth 1 -maxdepth 1 -type d -name 'iassetspro-*' | wc -l)"
[[ "$RELEASE_COUNT" -eq 2 ]] || { echo "STOP: expected 2 releases, found $RELEASE_COUNT"; exit 1; }

echo "[10/10] Final health and inbox cleanup"
if ! health_check "http://127.0.0.1:${PROD_PORT}/api/health" /tmp/iassetspro-final-local.json 3 2; then
  echo "STOP: final local health failed; rolling back runtime"
  rollback_runtime
  exit 1
fi
if ! health_check "${PUBLIC_URL}/api/health" /tmp/iassetspro-final-public.json 3 3; then
  echo "STOP: final public health failed; rolling back runtime"
  rollback_runtime
  exit 1
fi
pm2 status "$PM2_NAME"
pm2 save
rm -rf -- "$(dirname "$ARTIFACT")"
df -h /

echo "============================================================"
echo " iAssetsPro ARTIFACT DEPLOYMENT SUCCESSFUL"
echo " Active  : $NEW_RELEASE"
echo " Rollback: $OLD_RELEASE"
echo " SHA     : $SHA"
echo " VPS build/install work: NONE"
echo "============================================================"
