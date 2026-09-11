#!/usr/bin/env bash
set -euo pipefail

EXPECTED_BASE="90e3250e805a8bbaf6201aa0247cefe5a0ecf275"
FEATURE_BRANCH="fix/technician-workflow-v1-1-completion"
WORK="/home/lightworld/releases/iassetspro-technician-workflow-v1-1"
APP_LINK="/home/lightworld/webapps/iassetspro"
TEST_FILE="src/__tests__/work-orders/technician-workflow-v11-contract.test.ts"

[[ -d "$WORK/.git" ]] || { echo "STOP: V1.1 workspace not found: $WORK"; exit 1; }
ACTIVE="$(readlink -f "$APP_LINK")"
[[ -n "$ACTIVE" && -d "$ACTIVE" ]] || { echo "STOP: active production release could not be resolved"; exit 1; }

cd "$WORK"

HEAD_SHA="$(git rev-parse HEAD)"
BRANCH="$(git branch --show-current)"
echo "Workspace HEAD : $HEAD_SHA"
echo "Workspace branch: $BRANCH"
echo "Active release  : $ACTIVE"
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

echo "===== PRODUCTION HEALTH BEFORE VALIDATION ====="
HEALTH_CODE="$(curl -sS -o /tmp/iassetspro-v11-pre-health.json -w '%{http_code}' --max-time 10 http://127.0.0.1:3001/api/health || true)"
echo "Production HTTP: $HEALTH_CODE"
[[ "$HEALTH_CODE" == "200" ]] || { echo "STOP: current production runtime is not healthy"; exit 1; }

# The first-pass workspace intentionally reused production node_modules through a
# symlink. Next 16/Turbopack refuses a node_modules symlink that points outside
# the project root, and prisma generate would also write through that symlink.
# Replace it with an isolated local copy before any further validation/build.
echo "===== LOCALIZE DEPENDENCIES FOR TURBOPACK ====="
if [[ -L node_modules ]]; then
  DEP_SOURCE="$(readlink -f node_modules)"
  EXPECTED_DEP_SOURCE="$ACTIVE/node_modules"
  echo "Dependency symlink: $DEP_SOURCE"
  [[ "$DEP_SOURCE" == "$EXPECTED_DEP_SOURCE" ]] || {
    echo "STOP: dependency symlink points somewhere unexpected: $DEP_SOURCE"
    exit 1
  }

  MODULE_BYTES="$(du -sb "$DEP_SOURCE" | awk '{print $1}')"
  AVAIL_BYTES="$(df -PB1 "$WORK" | awk 'NR==2 {print $4}')"
  RESERVE_BYTES=$((4 * 1024 * 1024 * 1024))
  REQUIRED_BYTES=$((MODULE_BYTES + RESERVE_BYTES))

  echo "node_modules bytes : $MODULE_BYTES"
  echo "available bytes    : $AVAIL_BYTES"
  echo "required minimum   : $REQUIRED_BYTES"

  if (( AVAIL_BYTES < REQUIRED_BYTES )); then
    echo "STOP: insufficient disk to create an isolated dependency tree and production build."
    df -h /
    exit 1
  fi

  rm node_modules
  cp -a --reflink=auto "$DEP_SOURCE" "$WORK/node_modules"
fi

[[ -d node_modules && ! -L node_modules ]] || {
  echo "STOP: workspace node_modules is not an isolated local directory"
  exit 1
}

LOCAL_DEPS="$(readlink -f node_modules)"
[[ "$LOCAL_DEPS" == "$WORK/node_modules" ]] || {
  echo "STOP: localized dependency tree resolved outside the workspace: $LOCAL_DEPS"
  exit 1
}

echo "Localized dependencies: $LOCAL_DEPS"

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
[[ -f .next/standalone/server.js ]] || { echo "STOP: standalone production server artifact missing after build"; exit 1; }

echo "===== PRODUCTION HEALTH AFTER BUILD ====="
HEALTH_CODE="$(curl -sS -o /tmp/iassetspro-v11-post-build-health.json -w '%{http_code}' --max-time 10 http://127.0.0.1:3001/api/health || true)"
echo "Production HTTP: $HEALTH_CODE"
[[ "$HEALTH_CODE" == "200" ]] || { echo "STOP: current production runtime became unhealthy during validation"; exit 1; }

echo "===== COMMIT AND PUSH ====="
# The standalone artifact now contains the runtime dependencies it needs. Remove
# the temporary local dependency tree to recover validation disk space.
rm -rf --one-file-system "$WORK/node_modules"
rm -rf "$WORK/.next/cache"

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
echo "Build artifact: $WORK/.next/standalone/server.js"
df -h /
