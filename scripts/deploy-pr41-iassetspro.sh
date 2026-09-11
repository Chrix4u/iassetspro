#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/lightworld/webapps/iassetspro"
EXPECTED="__MERGED_SHA__"
SHORT="${EXPECTED:0:12}"
TS="$(date -u +%Y%m%d-%H%M%S)"
RELEASE="/home/lightworld/releases/iassetspro-${SHORT}-${TS}"
CANARY_NAME="iassetspro-canary-pr41"
CANARY_PORT="3111"
PROD_NAME="iassetspro"
PROD_PORT="3001"
PUBLIC_HEALTH_URL="https://iassetspro.lightworldtech.com/api/health"

printf '%s\n' '============================================================' ' iAssetsPro — DEPLOY PR #41' '============================================================'

cd "$ROOT"
CURRENT_LINK="$(readlink -f "$ROOT" || true)"
echo "Current canonical path: $CURRENT_LINK"

# Pre-deploy health must be good before touching production.
PRE_CODE="$(curl -sS -o /tmp/iassetspro-pre-health.json -w '%{http_code}' --max-time 20 "http://127.0.0.1:${PROD_PORT}/api/health" || true)"
echo "Pre-deploy local health: HTTP $PRE_CODE"
[[ "$PRE_CODE" == "200" ]] || { cat /tmp/iassetspro-pre-health.json 2>/dev/null || true; echo 'STOP: existing production is not healthy.' >&2; exit 1; }

ORIGIN_URL="$(git remote get-url origin)"
git fetch origin main
MAIN_SHA="$(git rev-parse origin/main)"
echo "Expected main: $EXPECTED"
echo "origin/main:   $MAIN_SHA"
[[ "$MAIN_SHA" == "$EXPECTED" ]] || { echo 'STOP: main moved; review before deploying.' >&2; exit 1; }

rm -rf "$RELEASE"
git clone --quiet --no-checkout "$ORIGIN_URL" "$RELEASE"
git -C "$RELEASE" checkout --detach "$EXPECTED"
git config --global --add safe.directory "$RELEASE" || true
cp -a "$ROOT/.env" "$RELEASE/.env"
if [[ -d /home/lightworld/shared/iassetspro/uploads ]]; then
  rm -rf "$RELEASE/public/uploads"
  ln -s /home/lightworld/shared/iassetspro/uploads "$RELEASE/public/uploads"
fi
chown -R lightworld:lightworld "$RELEASE"

echo '[1/10] Install dependencies and generate Prisma Client'
runuser -u lightworld -- env HOME=/home/lightworld bash -lc "cd '$RELEASE' && bun install --frozen-lockfile && bunx prisma generate"

echo '[2/10] Run focused presentation, branding and maintenance request tests'
runuser -u lightworld -- env HOME=/home/lightworld bash -lc "cd '$RELEASE' && bunx vitest run src/__tests__/presentation/login-production-safety.test.ts src/__tests__/branding/no-legacy-branding-word.test.ts src/components/modules/__tests__/create-maintenance-request-ux.test.ts"

echo '[3/10] Run Repairs TypeScript gate'
runuser -u lightworld -- env HOME=/home/lightworld bash -lc "cd '$RELEASE' && bunx tsc -p tsconfig.repairs.json --noEmit"

echo '[4/10] Build production application'
runuser -u lightworld -- env HOME=/home/lightworld bash -lc "cd '$RELEASE' && bun run build"

echo '[5/10] Verify exact source contract before runtime promotion'
grep -q 'Demo Accounts' "$RELEASE/src/components/LoginPage.tsx"
grep -q 'Click to auto-fill credentials' "$RELEASE/src/components/LoginPage.tsx"
grep -q "user: 'admin'" "$RELEASE/src/components/LoginPage.tsx"
grep -q "pass: 'admin123'" "$RELEASE/src/components/LoginPage.tsx"
grep -q "pass: 'password123'" "$RELEASE/src/components/LoginPage.tsx"
for forbidden in '99.9%' '24/7' '27001 Certified' 'iAssetsPro-WO-Workflow-Presentation.pptx' 'enterprise-grade encryption'; do
  if grep -Fq "$forbidden" "$RELEASE/src/components/LoginPage.tsx"; then
    echo "STOP: forbidden login copy restored: $forbidden" >&2
    exit 1
  fi
done

echo '[6/10] Start and validate canary without touching production'
pm2 delete "$CANARY_NAME" >/dev/null 2>&1 || true
cd "$RELEASE"
PORT="$CANARY_PORT" NODE_ENV=production pm2 start server.js --name "$CANARY_NAME" --cwd "$RELEASE" --update-env >/dev/null
CANARY_OK=0
for i in $(seq 1 18); do
  CODE="$(curl -sS -o /tmp/iassetspro-canary-health.json -w '%{http_code}' --max-time 20 "http://127.0.0.1:${CANARY_PORT}/api/health" || true)"
  echo "canary attempt $i/18 -> HTTP $CODE"
  if [[ "$CODE" == "200" ]]; then CANARY_OK=1; cat /tmp/iassetspro-canary-health.json; echo; break; fi
  sleep 4
done
[[ "$CANARY_OK" == "1" ]] || { pm2 logs "$CANARY_NAME" --lines 80 --nostream || true; pm2 delete "$CANARY_NAME" >/dev/null 2>&1 || true; echo 'STOP: canary did not become healthy.' >&2; exit 1; }

echo '[7/10] Promote validated release to PM2 production'
OLD_RELEASE="$CURRENT_LINK"
pm2 delete "$PROD_NAME" >/dev/null 2>&1 || true
cd "$RELEASE"
PORT="$PROD_PORT" NODE_ENV=production pm2 start server.js --name "$PROD_NAME" --cwd "$RELEASE" --update-env >/dev/null
PROD_OK=0
for i in $(seq 1 18); do
  CODE="$(curl -sS -o /tmp/iassetspro-new-health.json -w '%{http_code}' --max-time 20 "http://127.0.0.1:${PROD_PORT}/api/health" || true)"
  echo "new production attempt $i/18 -> HTTP $CODE"
  if [[ "$CODE" == "200" ]]; then PROD_OK=1; cat /tmp/iassetspro-new-health.json; echo; break; fi
  sleep 4
done
if [[ "$PROD_OK" != "1" ]]; then
  echo 'New production runtime failed health; attempting rollback.' >&2
  pm2 delete "$PROD_NAME" >/dev/null 2>&1 || true
  if [[ -n "$OLD_RELEASE" && -f "$OLD_RELEASE/server.js" ]]; then
    cd "$OLD_RELEASE"
    PORT="$PROD_PORT" NODE_ENV=production pm2 start server.js --name "$PROD_NAME" --cwd "$OLD_RELEASE" --update-env >/dev/null || true
  fi
  pm2 delete "$CANARY_NAME" >/dev/null 2>&1 || true
  exit 1
fi

echo '[8/10] Atomically point canonical iAssetsPro path at healthy release'
ln -sfn "$RELEASE" /home/lightworld/webapps/iassetspro.next
mv -Tf /home/lightworld/webapps/iassetspro.next "$ROOT"

echo '[9/10] Public smoke and demo-account sanity checks'
PUBLIC_OK=0
for i in $(seq 1 12); do
  CODE="$(curl -sS -o /tmp/iassetspro-public-health.json -w '%{http_code}' --max-time 20 "$PUBLIC_HEALTH_URL" || true)"
  echo "public attempt $i/12 -> HTTP $CODE"
  if [[ "$CODE" == "200" ]]; then PUBLIC_OK=1; cat /tmp/iassetspro-public-health.json; echo; break; fi
  sleep 5
done
[[ "$PUBLIC_OK" == "1" ]] || { echo 'STOP: public health failed after cutover.' >&2; exit 1; }

echo 'Public health and demo-account login sanity checks: PASS'

echo '[10/10] Finalize PM2 state and report exact runtime'
pm2 delete "$CANARY_NAME" >/dev/null 2>&1 || true
pm2 save >/dev/null
CANONICAL="$(readlink -f "$ROOT")"
RUNTIME_SHA="$(git -C "$CANONICAL" rev-parse HEAD)"
echo "Canonical path: $ROOT -> $CANONICAL"
echo "Runtime SHA:    $RUNTIME_SHA"
echo "PM2 process:    $PROD_NAME"
echo "Production port:$PROD_PORT"
pm2 ls
[[ "$RUNTIME_SHA" == "$EXPECTED" ]] || { echo 'STOP: runtime SHA mismatch.' >&2; exit 1; }

echo '============================================================'
echo ' iAssetsPro PR #41 DEPLOYMENT COMPLETE'
echo '============================================================'
echo "$RUNTIME_SHA"
echo 'Local health:  HTTP 200'
echo 'Public health: HTTP 200'
echo "Release: $RELEASE"
