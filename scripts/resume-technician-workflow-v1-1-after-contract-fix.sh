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

mapfile -t CHANGED < <(git status --porcelain=v1 -uall | sed -E 's/^.. //' | sort)
ALLOWED=(
  "src/__tests__/work-orders/technician-workflow-v11-contract.test.ts"
  "src/app/api/work-orders/[id]/capabilities/route.ts"
  "src/app/api/work-orders/[id]/downtime/route.ts"
  "src/components/modules/TechnicianWorkOrderPage.tsx"
  "src/components/modules/TechnicianWorkOrderV11Panels.tsx"
)

echo "Workspace changes:"
printf '  %s\n' "${CHANGED[@]}"

for path in "${CHANGED[@]}"; do
  ok=0
  for allowed in "${ALLOWED[@]}"; do
    [[ "$path" == "$allowed" ]] && ok=1 && break
  done
  [[ "$ok" == 1 ]] || { echo "STOP: unexpected modified path: $path"; exit 1; }
done

for required in "${ALLOWED[@]}"; do
  if [[ "$required" == "$TEST_FILE" ]]; then
    continue
  fi
  [[ -e "$required" ]] || { echo "STOP: expected V1.1 file missing: $required"; exit 1; }
done

cat > "$TEST_FILE" <<'TEST'
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('technician workflow V1.1 completion contract', () => {
  it('uses a lifecycle-oriented full-page workspace', () => {
    const page = read('src/components/modules/TechnicianWorkOrderPage.tsx');
    const panel = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');
    expect(page).toContain('TechnicianWorkOrderV11Panels');
    expect(page).toContain('id="assignment"');
    expect(page).toContain('id="preparation"');
    expect(page).toContain('id="execution"');
    expect(page).toContain('id="evidence"');
    expect(page).toContain('id="completion"');
    for (const label of ['Assignment', 'Preparation', 'Execution', 'Resources', 'Evidence', 'Completion']) {
      expect(panel).toContain(`label: '${label}'`);
    }
    expect(panel).toContain('grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6');
    expect(panel).toContain('grid grid-cols-1 2xl:grid-cols-2');
  });

  it('integrates materials, tools and personal tools in the technician workspace', () => {
    const panel = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');
    expect(panel).toContain('`/api/work-orders/${workOrderId}/materials`');
    expect(panel).toContain("api.post('/api/repairs/tool-requests'");
    expect(panel).toContain('`/api/work-orders/${workOrderId}/personal-tools`');
    expect(panel).toContain('Materials — Request & Status');
    expect(panel).toContain('Tools — Request, Issue & Personal Tools');
  });

  it('provides work-order-scoped downtime capture with authorization and audit', () => {
    const route = read('src/app/api/work-orders/[id]/downtime/route.ts');
    const panel = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');
    expect(route).toContain('authorizeWorkOrderPlant');
    expect(route).toContain('isExecutionMember');
    expect(route).toContain("buildAuditData('create', 'wo_downtime'");
    expect(route).toContain("buildAuditData('update', 'wo_downtime'");
    expect(route).toContain('workOrderDowntime.create');
    expect(route).toContain('workOrderDowntime.update');
    expect(panel).toContain('`/api/work-orders/${workOrderId}/downtime`');
    expect(panel).toContain('Start Downtime');
    expect(panel).toContain('End Downtime');
  });

  it('embeds labor history without reviving stale live /time-logs writes', () => {
    const panel = read('src/components/modules/TechnicianWorkOrderV11Panels.tsx');
    expect(panel).toContain('`/api/work-orders/${workOrderId}/time-logs');
    expect(panel).toContain('Labor & Time History');
    expect(panel).not.toContain('api.post(`/api/work-orders/${workOrderId}/time-logs`');
    expect(panel).not.toContain('api.patch(`/api/work-orders/${workOrderId}/time-logs`');
  });

  it('keeps tool request UI aligned with endpoint permission and exposes downtime capability', () => {
    const caps = read('src/app/api/work-orders/[id]/capabilities/route.ts');
    expect(caps).toContain("hasPermission(session, 'repair_tool_requests.create')");
    expect(caps).toContain('canCreateToolRequest');
    expect(caps).toContain('canLogDowntime:');
  });
});
TEST

echo "===== REWRITTEN CONTRACT TEST ====="
sed -n '1,120p' "$TEST_FILE"

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
