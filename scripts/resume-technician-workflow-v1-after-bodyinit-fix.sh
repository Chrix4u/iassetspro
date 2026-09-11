#!/usr/bin/env bash
set -euo pipefail

WORK="/home/lightworld/releases/iassetspro-technician-workflow-v1"
FEATURE_BRANCH="fix/technician-workflow-v1"
EXPECTED_HEAD="d3ffe3f1d0f6303a4a9c3fc58b089603231e77ec"

cd "$WORK"

CURRENT_BRANCH="$(git branch --show-current)"
CURRENT_HEAD="$(git rev-parse HEAD)"
if [ "$CURRENT_BRANCH" != "$FEATURE_BRANCH" ]; then
  echo "STOP: expected branch $FEATURE_BRANCH, found $CURRENT_BRANCH"
  exit 1
fi
if [ "$CURRENT_HEAD" != "$EXPECTED_HEAD" ]; then
  echo "STOP: expected HEAD $EXPECTED_HEAD before recovery, found $CURRENT_HEAD"
  exit 1
fi

AVAILABLE_KB="$(df -Pk / | awk 'NR==2 {print $4}')"
if [ "$AVAILABLE_KB" -lt 6291456 ]; then
  echo "STOP: less than 6 GiB free on /."
  df -h /
  exit 1
fi

TARGET='src/app/api/work-orders/[id]/attachments/[attachmentId]/route.ts'
python3 - <<'PY'
from pathlib import Path
p = Path('src/app/api/work-orders/[id]/attachments/[attachmentId]/route.ts')
s = p.read_text()
old = "    return new NextResponse(stored.buffer, {\n"
new = "    const responseBody = Uint8Array.from(stored.buffer).buffer;\n    return new NextResponse(responseBody, {\n"
count = s.count(old)
if count != 1:
    raise SystemExit(f'STOP: expected one NextResponse Buffer anchor, found {count}')
p.write_text(s.replace(old, new, 1))
print('Patched NextResponse body from Node Buffer to ArrayBuffer.')
PY

git diff --check

echo "===== WORKTREE ====="
git status --short

echo "===== RE-RUN FOCUSED TESTS ====="
bun test src/__tests__/work-orders/technician-workflow-contract.test.ts \
  src/components/modules/__tests__/create-maintenance-request-ux.test.ts

echo "===== REPAIRS TYPESCRIPT ====="
bunx tsc -p tsconfig.repairs.json --noEmit

echo "===== PRODUCTION BUILD ====="
bun run build

echo "===== COMMIT ====="
git add \
  src/app/api/work-orders/[id]/capabilities/route.ts \
  src/app/api/work-orders/[id]/route.ts \
  src/app/api/work-orders/[id]/attachments/route.ts \
  src/app/api/work-orders/[id]/attachments/[attachmentId]/route.ts \
  src/components/modules/TechnicianWorkOrderPage.tsx \
  src/__tests__/work-orders/technician-workflow-contract.test.ts

git commit -m "Close technician workspace UX gaps"
NEW_SHA="$(git rev-parse HEAD)"

git fetch origin "$FEATURE_BRANCH"
REMOTE_HEAD="$(git rev-parse "origin/$FEATURE_BRANCH")"
if [ "$REMOTE_HEAD" != "$EXPECTED_HEAD" ]; then
  echo "STOP: remote feature branch moved from $EXPECTED_HEAD to $REMOTE_HEAD; not pushing."
  exit 1
fi

git push origin HEAD:"$FEATURE_BRANCH"

echo "============================================================"
echo " iAssetsPro TECHNICIAN WORKFLOW V1 CORRECTED AND PUSHED"
echo "============================================================"
echo "$NEW_SHA"
df -h /
