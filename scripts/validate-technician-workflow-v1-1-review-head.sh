#!/usr/bin/env bash
set -euo pipefail

EXPECTED_MAIN="90e3250e805a8bbaf6201aa0247cefe5a0ecf275"
EXPECTED_FEATURE="d90e8fc0d08493bbb9a8e7bb1c94530c9b4a77b5"
FEATURE_BRANCH="fix/technician-workflow-v1-1-completion"
WORK="/home/lightworld/releases/iassetspro-technician-workflow-v1-1"
APP_LINK="/home/lightworld/webapps/iassetspro"
CREATED_LOCAL_NODE_MODULES=0

cleanup_local_deps() {
  if [[ "$CREATED_LOCAL_NODE_MODULES" == "1" && -d "$WORK/node_modules" && ! -L "$WORK/node_modules" ]]; then
    echo "===== CLEAN TEMP LOCAL DEPENDENCIES ====="
    rm -rf --one-file-system "$WORK/node_modules"
  fi
}
trap cleanup_local_deps EXIT INT TERM

[[ -d "$WORK/.git" ]] || { echo "STOP: V1.1 workspace missing: $WORK"; exit 1; }
ACTIVE="$(readlink -f "$APP_LINK")"
[[ -n "$ACTIVE" && -d "$ACTIVE/.git" ]] || { echo "STOP: active production release invalid"; exit 1; }
[[ -d "$ACTIVE/node_modules" ]] || { echo "STOP: active production node_modules missing"; exit 1; }

cd "$WORK"
git fetch origin main "$FEATURE_BRANCH"
MAIN_SHA="$(git rev-parse origin/main)"
HEAD_SHA="$(git rev-parse HEAD)"
REMOTE_FEATURE="$(git rev-parse origin/$FEATURE_BRANCH)"
BRANCH="$(git branch --show-current)"

echo "============================================================"
echo " iAssetsPro — TECHNICIAN WORKFLOW V1.1 REVIEW-HEAD VALIDATION"
echo "============================================================"
echo "origin/main   : $MAIN_SHA"
echo "feature HEAD  : $HEAD_SHA"
echo "remote feature: $REMOTE_FEATURE"
echo "branch        : $BRANCH"
echo "active        : $ACTIVE"

[[ "$MAIN_SHA" == "$EXPECTED_MAIN" ]] || { echo "STOP: main moved; expected $EXPECTED_MAIN"; exit 1; }
[[ "$HEAD_SHA" == "$EXPECTED_FEATURE" ]] || { echo "STOP: local feature HEAD mismatch"; exit 1; }
[[ "$REMOTE_FEATURE" == "$EXPECTED_FEATURE" ]] || { echo "STOP: remote feature HEAD mismatch"; exit 1; }
[[ "$BRANCH" == "$FEATURE_BRANCH" ]] || { echo "STOP: wrong feature branch"; exit 1; }
[[ -z "$(git status --porcelain=v1 -uall)" ]] || { echo "STOP: feature workspace is not clean"; git status --short; exit 1; }

echo "===== PRODUCTION HEALTH BEFORE VALIDATION ====="
CODE="$(curl -sS -o /tmp/iassetspro-v11-review-head-before.json -w '%{http_code}' --max-time 10 http://127.0.0.1:3001/api/health || true)"
echo "Production HTTP: $CODE"
[[ "$CODE" == "200" ]] || { echo "STOP: production unhealthy"; exit 1; }

echo "===== LOCALIZE DEPENDENCIES FOR TURBOPACK ====="
if [[ -L node_modules ]]; then
  rm node_modules
fi

if [[ ! -d node_modules ]]; then
  SRC_NODE_MODULES="$ACTIVE/node_modules"
  NODE_BYTES="$(du -sb "$SRC_NODE_MODULES" | awk '{print $1}')"
  AVAIL_BYTES="$(df -PB1 "$WORK" | awk 'NR==2 {print $4}')"
  REQUIRED_BYTES="$((NODE_BYTES + 4 * 1024 * 1024 * 1024))"
  echo "node_modules bytes : $NODE_BYTES"
  echo "available bytes    : $AVAIL_BYTES"
  echo "required minimum   : $REQUIRED_BYTES"
  [[ "$AVAIL_BYTES" -ge "$REQUIRED_BYTES" ]] || { echo "STOP: insufficient disk for isolated dependency copy"; exit 1; }
  cp -a --reflink=auto "$SRC_NODE_MODULES" "$WORK/node_modules"
  CREATED_LOCAL_NODE_MODULES=1
fi

[[ -d node_modules && ! -L node_modules ]] || { echo "STOP: node_modules is not a local directory"; exit 1; }

echo "===== DIFF CHECK ====="
git diff --check "$EXPECTED_MAIN"..HEAD

echo "===== FOCUSED TESTS ====="
bun test \
  src/__tests__/work-orders/technician-workflow-contract.test.ts \
  src/__tests__/work-orders/technician-workflow-v11-contract.test.ts

echo "===== REPAIRS TYPESCRIPT ====="
bunx tsc -p tsconfig.repairs.json --noEmit

echo "===== PRODUCTION BUILD ====="
bun run build

[[ -f .next/standalone/server.js ]] || { echo "STOP: standalone server artifact missing"; exit 1; }

echo "===== PRODUCTION HEALTH AFTER VALIDATION ====="
CODE="$(curl -sS -o /tmp/iassetspro-v11-review-head-after.json -w '%{http_code}' --max-time 10 http://127.0.0.1:3001/api/health || true)"
echo "Production HTTP: $CODE"
[[ "$CODE" == "200" ]] || { echo "STOP: production unhealthy after validation"; exit 1; }

[[ -z "$(git status --porcelain=v1 -uall)" ]] || { echo "STOP: validation unexpectedly modified tracked files"; git status --short; exit 1; }

cleanup_local_deps
CREATED_LOCAL_NODE_MODULES=0

echo "============================================================"
echo " iAssetsPro TECHNICIAN WORKFLOW V1.1 REVIEW HEAD VALIDATED"
echo "============================================================"
echo "$EXPECTED_FEATURE"
echo "Build artifact: $WORK/.next/standalone/server.js"
df -h /
