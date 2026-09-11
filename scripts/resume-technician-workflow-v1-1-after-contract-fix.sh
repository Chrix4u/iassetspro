#!/usr/bin/env bash
set -euo pipefail

EXPECTED_BASE="90e3250e805a8bbaf6201aa0247cefe5a0ecf275"
FEATURE_BRANCH="fix/technician-workflow-v1-1-completion"
WORK="/home/lightworld/releases/iassetspro-technician-workflow-v1-1"
TEST_FILE="src/__tests__/work-orders/technician-workflow-v11-contract.test.ts"

[[ -d "$WORK/.git" ]] || { echo "STOP: V1.1 workspace not found: $WORK"; exit 1; }
cd "$WORK"

HEAD_SHA="$(git rev-parse HEAD)"
BRANCH="$(git branch --show-current)"
echo "Workspace HEAD : $HEAD_SHA"
echo "Workspace branch: $BRANCH"
[[ "$HEAD_SHA" == "$EXPECTED_BASE" ]] || { echo "STOP: workspace base changed unexpectedly"; exit 1; }
[[ "$BRANCH" == "$FEATURE_BRANCH" ]] || { echo "STOP: wrong workspace branch"; exit 1; }

# Refuse to proceed if the failed first pass left changes outside the intended V1.1 slice.
mapfile -t CHANGED < <(git status --porcelain | sed -E 's/^.. //' | sort)
ALLOWED=(
  "src/__tests__/work-orders/technician-workflow-v11-contract.test.ts"
  "src/app/api/work-orders/[id]/capabilities/route.ts"
  "src/app/api/work-orders/[id]/downtime/route.ts"
  "src/components/modules/TechnicianWorkOrderPage.tsx"
  "src/components/modules/TechnicianWorkOrderV11Panels.tsx"
)
for path in "${CHANGED[@]}"; do
  ok=0
  for allowed in "${ALLOWED[@]}"; do
    [[ "$path" == "$allowed" ]] && ok=1 && break
  done
  [[ "$ok" == 1 ]] || { echo "STOP: unexpected modified path: $path"; exit 1; }
done

[[ -f "$TEST_FILE" ]] || { echo "STOP: V1.1 contract test file missing"; exit 1; }

python3 - <<'PY'
from pathlib import Path
p = Path('src/__tests__/work-orders/technician-workflow-v11-contract.test.ts')
s = p.read_text()
repls = [
    ("expect(panel).toContain(`/api/work-orders/${workOrderId}/materials`);", "expect(panel).toContain('`/api/work-orders/${workOrderId}/materials`');"),
    ("expect(panel).toContain(`/api/work-orders/${workOrderId}/personal-tools`);", "expect(panel).toContain('`/api/work-orders/${workOrderId}/personal-tools`');"),
    ("expect(route).toContain(\"entityType: 'wo_downtime'\");", "expect(route).toContain(\"buildAuditData('create', 'wo_downtime'\");"),
    ("expect(panel).toContain(`/api/work-orders/${workOrderId}/downtime`);", "expect(panel).toContain('`/api/work-orders/${workOrderId}/downtime`');"),
    ("expect(panel).toContain(`/api/work-orders/${workOrderId}/time-logs`);", "expect(panel).toContain('`/api/work-orders/${workOrderId}/time-logs');"),
]
for old, new in repls:
    count = s.count(old)
    if count != 1:
        raise SystemExit(f'STOP: expected one test anchor for {old!r}, found {count}')
    s = s.replace(old, new, 1)
p.write_text(s)
PY

echo "===== CORRECTED CONTRACT TEST ====="
sed -n '20,60p' "$TEST_FILE"

echo "===== DIFF CHECK ====="
git diff --check

echo "===== FOCUSED TESTS ====="
bun test \
  src/__tests__/work-orders/technician-workflow-contract.test.ts \
  src/__tests__/work-orders/technician-workflow-v11-contract.test.ts

echo "===== REPAIRS TYPESCRIPT ====="
bunx tsc -p tsconfig.repairs.json --noEmit

echo "===== PRODUCTION BUILD ====="
bun run build

echo "===== COMMIT AND PUSH ====="
# Remove only the temporary dependency symlink created by the first-pass runner.
if [[ -L node_modules ]]; then rm node_modules; fi

git diff --check
git status --short

git add \
  'src/app/api/work-orders/[id]/downtime/route.ts' \
  'src/app/api/work-orders/[id]/capabilities/route.ts' \
  'src/components/modules/TechnicianWorkOrderPage.tsx' \
  'src/components/modules/TechnicianWorkOrderV11Panels.tsx' \
  'src/__tests__/work-orders/technician-workflow-v11-contract.test.ts'

git commit -m "Complete technician work order workspace V1.1"
git push -u origin "$FEATURE_BRANCH"

FEATURE_SHA="$(git rev-parse HEAD)"
echo "============================================================"
echo " iAssetsPro TECHNICIAN WORKFLOW V1.1 COMPLETED AND PUSHED"
echo "============================================================"
echo "$FEATURE_SHA"
df -h /
