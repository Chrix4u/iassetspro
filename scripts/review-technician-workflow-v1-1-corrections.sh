#!/usr/bin/env bash
set -euo pipefail

EXPECTED_MAIN="90e3250e805a8bbaf6201aa0247cefe5a0ecf275"
EXPECTED_FEATURE="b0b00b662072a8583badcd557e7355946a195811"
FEATURE_BRANCH="fix/technician-workflow-v1-1-completion"
WORK="/home/lightworld/releases/iassetspro-technician-workflow-v1-1"
APP_LINK="/home/lightworld/webapps/iassetspro"

[[ -d "$WORK/.git" ]] || { echo "STOP: V1.1 workspace missing: $WORK"; exit 1; }
ACTIVE="$(readlink -f "$APP_LINK")"
[[ -n "$ACTIVE" && -d "$ACTIVE/.git" ]] || { echo "STOP: active production release invalid"; exit 1; }

cd "$WORK"
git fetch origin main "$FEATURE_BRANCH"
MAIN_SHA="$(git rev-parse origin/main)"
HEAD_SHA="$(git rev-parse HEAD)"
BRANCH="$(git branch --show-current)"

echo "============================================================"
echo " iAssetsPro — TECHNICIAN WORKFLOW V1.1 POST-REVIEW CORRECTIONS"
echo "============================================================"
echo "origin/main : $MAIN_SHA"
echo "feature HEAD: $HEAD_SHA"
echo "branch      : $BRANCH"
echo "active      : $ACTIVE"

[[ "$MAIN_SHA" == "$EXPECTED_MAIN" ]] || { echo "STOP: main moved; expected $EXPECTED_MAIN"; exit 1; }
[[ "$HEAD_SHA" == "$EXPECTED_FEATURE" ]] || { echo "STOP: feature HEAD moved; expected $EXPECTED_FEATURE"; exit 1; }
[[ "$BRANCH" == "$FEATURE_BRANCH" ]] || { echo "STOP: wrong feature branch"; exit 1; }
[[ -z "$(git status --porcelain=v1 -uall)" ]] || { echo "STOP: feature workspace is not clean"; git status --short; exit 1; }

echo "===== PRODUCTION HEALTH BEFORE CORRECTIONS ====="
CODE="$(curl -sS -o /tmp/iassetspro-v11-review-before-health.json -w '%{http_code}' --max-time 10 http://127.0.0.1:3001/api/health || true)"
echo "Production HTTP: $CODE"
[[ "$CODE" == "200" ]] || { echo "STOP: production unhealthy"; exit 1; }

echo "===== APPLY REVIEW CORRECTIONS ====="
python3 - <<'PY'
from pathlib import Path


def replace_once(path: str, old: str, new: str):
    p = Path(path)
    s = p.read_text()
    n = s.count(old)
    if n != 1:
        raise SystemExit(f"STOP: {path}: expected exactly one anchor, found {n}: {old[:120]!r}")
    p.write_text(s.replace(old, new, 1))

# 1) Capability contract: downtime creation must match the actual API authority
# and only be exposed during active execution states.
cap = 'src/app/api/work-orders/[id]/capabilities/route.ts'
replace_once(
    cap,
    "    const canCreateToolRequest = isAdminAccount || hasPermission(session, 'repair_tool_requests.create');\n",
    "    const canCreateToolRequest = isAdminAccount || hasPermission(session, 'repair_tool_requests.create');\n"
    "    const canManageDowntime = isSupervisor || isPlanner || isExecutionManager || hasPermission(session, 'work_orders.update');\n",
)
replace_once(
    cap,
    "      canLogDowntime: ((isAssignee || isTeamMember || isTeamLeader) && activeExecutionStatuses.includes(wo.status)) || isSupervisor || isPlanner || isExecutionManager,",
    "      canLogDowntime: activeExecutionStatuses.includes(wo.status) && (\n"
    "        isAssignee || isTeamMember || isTeamLeader || canManageDowntime\n"
    "      ),",
)

# 2) Scoped downtime API: align authority/status with capabilities, reject
# negative production loss, and prevent multiple simultaneous ongoing events.
down = 'src/app/api/work-orders/[id]/downtime/route.ts'
replace_once(
    down,
    "const IMMUTABLE_STATUSES = new Set(['verified', 'closed', 'cancelled']);",
    "const IMMUTABLE_STATUSES = new Set(['completed', 'verified', 'closed', 'cancelled']);\n"
    "const ACTIVE_DOWNTIME_STATUSES = new Set(['in_progress', 'waiting_parts', 'waiting_tools', 'waiting_shutdown', 'waiting_permit', 'on_hold', 'pending_handover']);",
)
replace_once(
    down,
    "  teamLeaderId: string | null;\n  status: string;",
    "  teamLeaderId: string | null;\n  assignedSupervisorId: string | null;\n  plannerId: string | null;\n  status: string;",
)
replace_once(
    down,
    "      teamLeaderId: true,\n      status: true,",
    "      teamLeaderId: true,\n      assignedSupervisorId: true,\n      plannerId: true,\n      status: true,",
)
replace_once(
    down,
    "  const canManage = isAdmin(read.session) || hasAnyPermission(read.session, ['work_orders.update']);\n"
    "  if (!isExecutionMember(read.wo, read.session.userId) && !canManage) {\n"
    "    return { ok: false as const, response: NextResponse.json({ success: false, error: 'Only assigned execution staff or authorized maintenance management can record work-order downtime' }, { status: 403 }) };\n"
    "  }\n\n"
    "  if (read.wo.isLocked || IMMUTABLE_STATUSES.has(read.wo.status)) {\n"
    "    return { ok: false as const, response: NextResponse.json({ success: false, error: `Downtime cannot be changed for work order status: ${read.wo.status}` }, { status: 409 }) };\n"
    "  }\n\n"
    "  return read;",
    "  const isSupervisor = read.wo.assignedSupervisorId === read.session.userId;\n"
    "  const isPlanner = read.wo.plannerId === read.session.userId;\n"
    "  const isMaintenanceManager = read.session.roles.includes('maintenance_manager');\n"
    "  const canManage = isAdmin(read.session) || isMaintenanceManager || isSupervisor || isPlanner || hasAnyPermission(read.session, ['work_orders.update']);\n"
    "  if (!isExecutionMember(read.wo, read.session.userId) && !canManage) {\n"
    "    return { ok: false as const, response: NextResponse.json({ success: false, error: 'Only assigned execution staff or authorized maintenance management can record work-order downtime' }, { status: 403 }) };\n"
    "  }\n\n"
    "  if (read.wo.isLocked || IMMUTABLE_STATUSES.has(read.wo.status)) {\n"
    "    return { ok: false as const, response: NextResponse.json({ success: false, error: `Downtime cannot be changed for work order status: ${read.wo.status}` }, { status: 409 }) };\n"
    "  }\n\n"
    "  if (!ACTIVE_DOWNTIME_STATUSES.has(read.wo.status)) {\n"
    "    return { ok: false as const, response: NextResponse.json({ success: false, error: `Downtime can only be recorded during active work-order execution. Status: ${read.wo.status}` }, { status: 409 }) };\n"
    "  }\n\n"
    "  return read;",
)
replace_once(
    down,
    "    if (rawLoss != null && !Number.isFinite(rawLoss)) {\n      return NextResponse.json({ success: false, error: 'productionLoss must be numeric' }, { status: 400 });\n    }\n\n    const record = await db.$transaction(async (tx) => {",
    "    if (rawLoss != null && (!Number.isFinite(rawLoss) || rawLoss < 0)) {\n      return NextResponse.json({ success: false, error: 'productionLoss must be a non-negative number' }, { status: 400 });\n    }\n\n"
    "    if (!end) {\n"
    "      const existingOngoing = await db.workOrderDowntime.findFirst({\n"
    "        where: { workOrderId: id, downtimeEnd: null },\n"
    "        select: { id: true, downtimeStart: true },\n"
    "      });\n"
    "      if (existingOngoing) {\n"
    "        return NextResponse.json({\n"
    "          success: false,\n"
    "          error: 'An ongoing downtime record already exists for this work order. End it before starting another.',\n"
    "          data: { recordId: existingOngoing.id, downtimeStart: existingOngoing.downtimeStart },\n"
    "        }, { status: 409 });\n"
    "      }\n"
    "    }\n\n"
    "    const record = await db.$transaction(async (tx) => {",
)

# 3) Completion readiness: never snapshot downtime while a downtime event is
# still open, otherwise RepairCompletion would permanently undercount it.
ready = 'src/services/workOrderReadiness.service.ts'
replace_once(
    ready,
    "  timeLogs: { id: string; action: string; endTime: DateTime | null }[]\n",
    "  timeLogs: { id: string; action: string; endTime: DateTime | null }[]\n"
    "  workOrderDowntimes: { id: string; downtimeEnd: DateTime | null }[]\n",
)
replace_once(
    ready,
    "      timeLogs: { select: { id: true, action: true, endTime: true } },\n",
    "      timeLogs: { select: { id: true, action: true, endTime: true } },\n"
    "      workOrderDowntimes: { select: { id: true, downtimeEnd: true } },\n",
)
replace_once(
    ready,
    "  const activeTimers = wo.timeLogs.filter((tl) => (tl.action === 'start' || tl.action === 'resume') && !tl.endTime)\n  if (activeTimers.length > 0) blockers.push({ code: 'ACTIVE_TIMERS', category: 'timer', message: `${activeTimers.length} active time timer(s) must be stopped before completion`, severity: 'blocker' })\n\n",
    "  const activeTimers = wo.timeLogs.filter((tl) => (tl.action === 'start' || tl.action === 'resume') && !tl.endTime)\n"
    "  if (activeTimers.length > 0) blockers.push({ code: 'ACTIVE_TIMERS', category: 'timer', message: `${activeTimers.length} active time timer(s) must be stopped before completion`, severity: 'blocker' })\n\n"
    "  const ongoingDowntime = wo.workOrderDowntimes.filter((row) => !row.downtimeEnd)\n"
    "  if (ongoingDowntime.length > 0) blockers.push({ code: 'ONGOING_DOWNTIME', category: 'timer', message: `${ongoingDowntime.length} ongoing downtime record(s) must be ended before completion`, severity: 'blocker' })\n\n",
)

# 4) Permanent stage anchors: lifecycle navigation must keep working after
# assignment acceptance and after completion/review.
page = 'src/components/modules/TechnicianWorkOrderPage.tsx'
replace_once(
    page,
    "      </div>\n\n      {wo.status === 'assigned' && assignmentStatus === 'pending' && (caps?.canAcceptAssignment || caps?.canDeclineAssignment) && (",
    "      </div>\n\n      <div id=\"assignment\" className=\"scroll-mt-28\" aria-hidden=\"true\" />\n\n      {wo.status === 'assigned' && assignmentStatus === 'pending' && (caps?.canAcceptAssignment || caps?.canDeclineAssignment) && (",
)
replace_once(
    page,
    "        <Card id=\"assignment\" className=\"scroll-mt-28 border-sky-200 bg-sky-50/50 dark:bg-sky-950/20\">",
    "        <Card className=\"border-sky-200 bg-sky-50/50 dark:bg-sky-950/20\">",
)
replace_once(
    page,
    "          {caps?.canSubmitCompletion && (\n            <Card id=\"completion\" className=\"scroll-mt-28 border-emerald-200 bg-emerald-50/30 dark:bg-emerald-950/10\">",
    "          <div id=\"completion\" className=\"scroll-mt-28\" aria-hidden=\"true\" />\n\n          {caps?.canSubmitCompletion && (\n            <Card className=\"border-emerald-200 bg-emerald-50/30 dark:bg-emerald-950/10\">",
)

# 5) Client robustness: invalid/cleared local dates must never throw before the
# API can return a structured validation error; unauthorized viewers must not see
# an actionable End Downtime control.
panel = 'src/components/modules/TechnicianWorkOrderV11Panels.tsx'
replace_once(
    panel,
    "      if (refreshParent) await onChanged();\n      return true;\n    } finally {",
    "      if (refreshParent) await onChanged();\n      return true;\n    } catch (error: unknown) {\n      toast.error(error instanceof Error ? error.message : 'Action failed');\n      return false;\n    } finally {",
)
replace_once(
    panel,
    "  const recordDowntime = async () => {\n    if (downtimeForm.reason.trim().length < 3) { toast.error('Downtime reason is required'); return; }\n    const ok = await run('downtime', () => api.post(`/api/work-orders/${workOrderId}/downtime`, {\n      reason: downtimeForm.reason.trim(),\n      category: downtimeForm.category,\n      impactLevel: downtimeForm.impactLevel,\n      downtimeStart: new Date(downtimeForm.downtimeStart).toISOString(),\n      downtimeEnd: downtimeForm.downtimeEnd ? new Date(downtimeForm.downtimeEnd).toISOString() : undefined,\n      productionLoss: downtimeForm.productionLoss || undefined,\n      notes: downtimeForm.notes.trim() || undefined,\n    }), downtimeForm.downtimeEnd ? 'Downtime recorded' : 'Ongoing downtime started', false);",
    "  const recordDowntime = async () => {\n"
    "    if (downtimeForm.reason.trim().length < 3) { toast.error('Downtime reason is required'); return; }\n"
    "    const start = new Date(downtimeForm.downtimeStart);\n"
    "    const end = downtimeForm.downtimeEnd ? new Date(downtimeForm.downtimeEnd) : null;\n"
    "    if (!Number.isFinite(start.getTime())) { toast.error('Enter a valid downtime start'); return; }\n"
    "    if (end && !Number.isFinite(end.getTime())) { toast.error('Enter a valid downtime end'); return; }\n"
    "    if (end && end < start) { toast.error('Downtime end cannot be before start'); return; }\n"
    "    const productionLoss = downtimeForm.productionLoss === '' ? undefined : Number(downtimeForm.productionLoss);\n"
    "    if (productionLoss !== undefined && (!Number.isFinite(productionLoss) || productionLoss < 0)) { toast.error('Production loss must be a non-negative number'); return; }\n"
    "    const ok = await run('downtime', () => api.post(`/api/work-orders/${workOrderId}/downtime`, {\n"
    "      reason: downtimeForm.reason.trim(),\n"
    "      category: downtimeForm.category,\n"
    "      impactLevel: downtimeForm.impactLevel,\n"
    "      downtimeStart: start.toISOString(),\n"
    "      downtimeEnd: end?.toISOString(),\n"
    "      productionLoss,\n"
    "      notes: downtimeForm.notes.trim() || undefined,\n"
    "    }), end ? 'Downtime recorded' : 'Ongoing downtime started', false);",
)
replace_once(
    panel,
    "{row.downtimeEnd ? <Badge variant=\"outline\">{minutesLabel(row.durationMinutes)}</Badge> : <Button size=\"sm\" variant=\"outline\" onClick={() => endDowntime(row.id)} disabled={busy !== null}><XCircle className=\"h-3.5 w-3.5 mr-1\" />End Downtime</Button>}",
    "{row.downtimeEnd ? <Badge variant=\"outline\">{minutesLabel(row.durationMinutes)}</Badge> : capabilities?.canLogDowntime ? <Button size=\"sm\" variant=\"outline\" onClick={() => endDowntime(row.id)} disabled={busy !== null}><XCircle className=\"h-3.5 w-3.5 mr-1\" />End Downtime</Button> : <Badge variant=\"outline\">Ongoing</Badge>}",
)

# 6) Strengthen V1.1 contract coverage for the reviewed edge cases.
test = 'src/__tests__/work-orders/technician-workflow-v11-contract.test.ts'
replace_once(
    test,
    "    expect(route).toContain('workOrderDowntime.update');\n    expect(panel).toContain('`/api/work-orders/${workOrderId}/downtime`');",
    "    expect(route).toContain('workOrderDowntime.update');\n"
    "    expect(route).toContain('ACTIVE_DOWNTIME_STATUSES');\n"
    "    expect(route).toContain('An ongoing downtime record already exists');\n"
    "    expect(panel).toContain('`/api/work-orders/${workOrderId}/downtime`');",
)
replace_once(
    test,
    "    expect(caps).toContain('canLogDowntime:');\n  });",
    "    expect(caps).toContain('canManageDowntime');\n"
    "    expect(caps).toContain('canLogDowntime: activeExecutionStatuses.includes(wo.status)');\n"
    "  });\n\n"
    "  it('blocks completion while equipment downtime is still open and keeps stage anchors permanent', () => {\n"
    "    const readiness = read('src/services/workOrderReadiness.service.ts');\n"
    "    const page = read('src/components/modules/TechnicianWorkOrderPage.tsx');\n"
    "    expect(readiness).toContain('ONGOING_DOWNTIME');\n"
    "    expect(readiness).toContain('workOrderDowntimes');\n"
    "    expect(page).toContain('<div id=\"assignment\" className=\"scroll-mt-28\" aria-hidden=\"true\" />');\n"
    "    expect(page).toContain('<div id=\"completion\" className=\"scroll-mt-28\" aria-hidden=\"true\" />');\n"
    "  });",
)
PY

echo "===== REVIEW DIFF ====="
git diff --check
git status --short
git diff --stat

echo "===== LOCALIZE DEPENDENCIES ====="
if [[ -L node_modules ]]; then rm node_modules; fi
if [[ ! -d node_modules ]]; then
  NODE_BYTES="$(du -sb "$ACTIVE/node_modules" | awk '{print $1}')"
  AVAIL_BYTES="$(df -PB1 "$WORK" | awk 'NR==2 {print $4}')"
  REQUIRED_BYTES="$(( NODE_BYTES * 3 + 1500000000 ))"
  echo "node_modules bytes: $NODE_BYTES"
  echo "available bytes   : $AVAIL_BYTES"
  echo "required minimum  : $REQUIRED_BYTES"
  [[ "$AVAIL_BYTES" -gt "$REQUIRED_BYTES" ]] || { echo "STOP: insufficient disk for isolated dependency copy/build"; exit 1; }
  cp -a --reflink=auto "$ACTIVE/node_modules" "$WORK/node_modules"
fi

cleanup_deps() {
  if [[ -d "$WORK/node_modules" && ! -L "$WORK/node_modules" ]]; then
    rm -rf "$WORK/node_modules"
  fi
}
trap cleanup_deps EXIT INT TERM

echo "===== FOCUSED TESTS ====="
bun test \
  src/__tests__/work-orders/technician-workflow-contract.test.ts \
  src/__tests__/work-orders/technician-workflow-v11-contract.test.ts

echo "===== REPAIRS TYPESCRIPT ====="
bunx tsc -p tsconfig.repairs.json --noEmit

echo "===== PRODUCTION BUILD ====="
bun run build
[[ -f .next/standalone/server.js ]] || { echo "STOP: standalone server artifact missing"; exit 1; }

echo "===== PRODUCTION HEALTH AFTER BUILD ====="
CODE="$(curl -sS -o /tmp/iassetspro-v11-review-after-health.json -w '%{http_code}' --max-time 10 http://127.0.0.1:3001/api/health || true)"
echo "Production HTTP: $CODE"
[[ "$CODE" == "200" ]] || { echo "STOP: production unhealthy after isolated validation"; exit 1; }

echo "===== CLEAN VALIDATION DEPENDENCIES ====="
cleanup_deps
trap - EXIT INT TERM

echo "===== COMMIT AND PUSH REVIEW CORRECTIONS ====="
git diff --check
git add \
  'src/app/api/work-orders/[id]/capabilities/route.ts' \
  'src/app/api/work-orders/[id]/downtime/route.ts' \
  'src/services/workOrderReadiness.service.ts' \
  'src/components/modules/TechnicianWorkOrderPage.tsx' \
  'src/components/modules/TechnicianWorkOrderV11Panels.tsx' \
  'src/__tests__/work-orders/technician-workflow-v11-contract.test.ts'

git commit -m "Harden technician V1.1 downtime and lifecycle contracts"
git push origin "$FEATURE_BRANCH"

NEW_SHA="$(git rev-parse HEAD)"
echo "============================================================"
echo " iAssetsPro TECHNICIAN WORKFLOW V1.1 REVIEW CORRECTIONS PUSHED"
echo "============================================================"
echo "$NEW_SHA"
df -h /
