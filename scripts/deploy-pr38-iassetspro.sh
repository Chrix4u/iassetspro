#!/usr/bin/env bash
set -euo pipefail

TARGET_SHA="fca33e9b5fba4a4d56e914f672b75ddeeeeb86f8"
REPO="git@github.com:christianagbotah/eam-system.git"
LIVE="/home/lightworld/webapps/iassetspro"
RELEASES="/home/lightworld/releases"
SHARED="/home/lightworld/shared/iassetspro"
PROD_PORT="3001"
PM2_NAME="iassetspro"
CANARY_NAME="iassetspro-canary"
PUBLIC_URL="https://iassetspro.lightworldtech.com"
STAMP="$(date +%Y%m%d-%H%M%S)"
RELEASE="$RELEASES/iassetspro-${TARGET_SHA:0:12}-$STAMP"

say() { printf '\n[%s] %s\n' "$1" "$2"; }
health_code() {
  local url="$1"
  curl -sS -o /tmp/iassetspro-health.json -w '%{http_code}' --max-time 15 "$url" 2>/dev/null || true
}
wait_health() {
  local url="$1" attempts="${2:-18}" label="${3:-health}"
  local code=""
  for i in $(seq 1 "$attempts"); do
    code="$(health_code "$url")"
    echo "$label attempt $i/$attempts -> HTTP ${code:-000}"
    if [[ "$code" == "200" ]]; then
      cat /tmp/iassetspro-health.json || true
      echo
      return 0
    fi
    sleep 5
  done
  return 1
}

[[ "$(id -u)" -eq 0 ]] || { echo "STOP: run this deployment helper as root." >&2; exit 1; }
[[ -L "$LIVE" ]] || { echo "STOP: $LIVE is expected to be the production symlink." >&2; exit 1; }
OLD_REAL="$(readlink -f "$LIVE")"
[[ -d "$OLD_REAL" ]] || { echo "STOP: current production target is missing: $OLD_REAL" >&2; exit 1; }
[[ -f "$OLD_REAL/.env" ]] || { echo "STOP: production .env is missing." >&2; exit 1; }
[[ -f "$OLD_REAL/.next/standalone/server.js" ]] || { echo "STOP: current production standalone server is missing." >&2; exit 1; }

OLD_SHA="$(git -C "$OLD_REAL" rev-parse HEAD 2>/dev/null || true)"

echo "============================================================"
echo " iAssetsPro — PR #38 PRODUCTION DEPLOYMENT"
echo "============================================================"
echo "Current release: $OLD_REAL"
echo "Current source:  ${OLD_SHA:-unknown}"
echo "Target source:   $TARGET_SHA"
echo "New release:     $RELEASE"

say "1/10" "Preflight current production"
wait_health "http://127.0.0.1:${PROD_PORT}/api/health" 3 "local production" || {
  echo "STOP: current local production is not healthy." >&2
  exit 1
}
wait_health "${PUBLIC_URL}/api/health" 3 "public production" || {
  echo "STOP: current public production is not healthy." >&2
  exit 1
}
pm2 describe "$PM2_NAME" >/dev/null 2>&1 || { echo "STOP: root PM2 process $PM2_NAME not found." >&2; exit 1; }

say "2/10" "Verify GitHub main is exactly the merged PR #38 SHA"
git -C "$OLD_REAL" remote set-url origin "$REPO"
git -C "$OLD_REAL" fetch --no-tags origin main
REMOTE_MAIN="$(git -C "$OLD_REAL" rev-parse FETCH_HEAD)"
echo "GitHub main: $REMOTE_MAIN"
[[ "$REMOTE_MAIN" == "$TARGET_SHA" ]] || {
  echo "STOP: main moved. Expected $TARGET_SHA but found $REMOTE_MAIN" >&2
  exit 1
}

say "3/10" "Create independent release checkout"
mkdir -p "$RELEASES" "$SHARED"
git clone --no-checkout "$REPO" "$RELEASE"
git -C "$RELEASE" checkout --detach "$TARGET_SHA"
[[ "$(git -C "$RELEASE" rev-parse HEAD)" == "$TARGET_SHA" ]] || { echo "STOP: checkout SHA mismatch." >&2; exit 1; }
cp -a "$OLD_REAL/.env" "$RELEASE/.env"
chown -R lightworld:lightworld "$RELEASE"
git config --global --add safe.directory "$RELEASE" 2>/dev/null || true

say "4/10" "Move runtime uploads to persistent shared storage for release-safe cutovers"
SHARED_UPLOADS="$SHARED/uploads"
mkdir -p "$SHARED_UPLOADS"
chown -R lightworld:lightworld "$SHARED"

if [[ -L "$OLD_REAL/public/uploads" ]]; then
  EXISTING_UPLOADS="$(readlink -f "$OLD_REAL/public/uploads")"
  if [[ -d "$EXISTING_UPLOADS" && "$EXISTING_UPLOADS" != "$SHARED_UPLOADS" ]]; then
    if command -v rsync >/dev/null 2>&1; then
      rsync -a "$EXISTING_UPLOADS/" "$SHARED_UPLOADS/"
    else
      cp -a "$EXISTING_UPLOADS/." "$SHARED_UPLOADS/"
    fi
  fi
elif [[ -d "$OLD_REAL/public/uploads" ]]; then
  if command -v rsync >/dev/null 2>&1; then
    rsync -a "$OLD_REAL/public/uploads/" "$SHARED_UPLOADS/"
  else
    cp -a "$OLD_REAL/public/uploads/." "$SHARED_UPLOADS/"
  fi
fi
chown -R lightworld:lightworld "$SHARED_UPLOADS"

mkdir -p "$RELEASE/public"
rm -rf "$RELEASE/public/uploads"
ln -s "$SHARED_UPLOADS" "$RELEASE/public/uploads"
chown -h lightworld:lightworld "$RELEASE/public/uploads"

echo "Persistent uploads: $SHARED_UPLOADS"

say "5/10" "Build exact merged main release as lightworld"
runuser -u lightworld -- env HOME=/home/lightworld bash -lc "
set -euo pipefail
cd '$RELEASE'
bun install --frozen-lockfile
bun run build
"
[[ -f "$RELEASE/.next/standalone/server.js" ]] || { echo "STOP: standalone build artifact missing." >&2; exit 1; }

# Ensure both cwd-based attachment access and standalone static serving use the
# persistent upload store, regardless of how the build copied public/.
mkdir -p "$RELEASE/.next/standalone/public"
rm -rf "$RELEASE/public/uploads" "$RELEASE/.next/standalone/public/uploads"
ln -s "$SHARED_UPLOADS" "$RELEASE/public/uploads"
ln -s "$SHARED_UPLOADS" "$RELEASE/.next/standalone/public/uploads"
chown -h lightworld:lightworld "$RELEASE/public/uploads" "$RELEASE/.next/standalone/public/uploads"

say "6/10" "Start and validate canary without touching production"
CANARY_PORT=""
for p in $(seq 3100 3199); do
  if ! ss -ltn | grep -q ":${p} "; then
    CANARY_PORT="$p"
    break
  fi
done
[[ -n "$CANARY_PORT" ]] || { echo "STOP: no free canary port found." >&2; exit 1; }
pm2 delete "$CANARY_NAME" >/dev/null 2>&1 || true
PORT="$CANARY_PORT" HOSTNAME=127.0.0.1 NODE_ENV=production \
  pm2 start "$RELEASE/.next/standalone/server.js" \
  --name "$CANARY_NAME" --cwd "$RELEASE" \
  --node-args="--env-file=$RELEASE/.env" --time >/dev/null

if ! wait_health "http://127.0.0.1:${CANARY_PORT}/api/health" 18 "canary"; then
  pm2 logs "$CANARY_NAME" --lines 120 --nostream || true
  pm2 delete "$CANARY_NAME" >/dev/null 2>&1 || true
  echo "STOP: canary failed; production was not changed." >&2
  exit 1
fi

rollback() {
  echo
  echo "ROLLBACK: restoring $OLD_REAL"
  pm2 delete "$PM2_NAME" >/dev/null 2>&1 || true
  rm -f "${LIVE}.next"
  ln -s "$OLD_REAL" "${LIVE}.next"
  mv -Tf "${LIVE}.next" "$LIVE"
  PORT="$PROD_PORT" HOSTNAME=127.0.0.1 NODE_ENV=production \
    pm2 start "$OLD_REAL/.next/standalone/server.js" \
    --name "$PM2_NAME" --cwd "$OLD_REAL" \
    --node-args="--env-file=$OLD_REAL/.env" --time >/dev/null
  wait_health "http://127.0.0.1:${PROD_PORT}/api/health" 18 "rollback" || {
    pm2 logs "$PM2_NAME" --lines 150 --nostream || true
    echo "ROLLBACK FAILED: manual intervention required." >&2
    return 1
  }
  pm2 save >/dev/null
  echo "ROLLBACK COMPLETE"
}

say "7/10" "Promote validated release to PM2 production"
pm2 delete "$PM2_NAME" >/dev/null 2>&1 || true
PORT_CLEARED=0
for i in $(seq 1 12); do
  if ! ss -ltn | grep -q ":${PROD_PORT} "; then PORT_CLEARED=1; break; fi
  sleep 1
done
if [[ "$PORT_CLEARED" != "1" ]]; then
  echo "Production port $PROD_PORT did not clear." >&2
  rollback || true
  exit 1
fi

PORT="$PROD_PORT" HOSTNAME=127.0.0.1 NODE_ENV=production \
  pm2 start "$RELEASE/.next/standalone/server.js" \
  --name "$PM2_NAME" --cwd "$RELEASE" \
  --node-args="--env-file=$RELEASE/.env" --time >/dev/null

if ! wait_health "http://127.0.0.1:${PROD_PORT}/api/health" 18 "new production"; then
  pm2 logs "$PM2_NAME" --lines 150 --nostream || true
  rollback
  exit 1
fi

say "8/10" "Atomically point canonical iAssetsPro path at the healthy release"
rm -f "${LIVE}.next"
ln -s "$RELEASE" "${LIVE}.next"
mv -Tf "${LIVE}.next" "$LIVE"
[[ "$(readlink -f "$LIVE")" == "$RELEASE" ]] || {
  echo "Canonical symlink promotion failed." >&2
  rollback
  exit 1
}

say "9/10" "Public smoke check and visible-branding sanity check"
if ! wait_health "${PUBLIC_URL}/api/health" 12 "public"; then
  rollback
  exit 1
fi

ROOT_HTML="$(curl -fsS --max-time 20 "${PUBLIC_URL}/" || true)"
if [[ -n "$ROOT_HTML" ]]; then
  if grep -Fq 'Enterprise Asset Management' <<<"$ROOT_HTML"; then
    echo "STOP: legacy user-facing branding is still present in public root HTML." >&2
    rollback
    exit 1
  fi
  echo "Public root branding sanity check: PASS"
else
  echo "WARN: public root HTML could not be inspected; health endpoint is healthy."
fi

say "10/10" "Finalize PM2 state and report exact runtime"
pm2 delete "$CANARY_NAME" >/dev/null 2>&1 || true
pm2 save >/dev/null

FINAL_REAL="$(readlink -f "$LIVE")"
FINAL_SHA="$(git -C "$FINAL_REAL" rev-parse HEAD)"
echo "Canonical path: $LIVE -> $FINAL_REAL"
echo "Runtime SHA:    $FINAL_SHA"
echo "PM2 process:    $PM2_NAME"
echo "Production port:$PROD_PORT"
pm2 status "$PM2_NAME"

[[ "$FINAL_SHA" == "$TARGET_SHA" ]] || { echo "STOP: final runtime SHA mismatch." >&2; exit 1; }

echo "============================================================"
echo " iAssetsPro PR #38 DEPLOYMENT COMPLETE"
echo "============================================================"
echo "$TARGET_SHA"
echo "Local health:  HTTP 200"
echo "Public health: HTTP 200"
echo "Release: $FINAL_REAL"
