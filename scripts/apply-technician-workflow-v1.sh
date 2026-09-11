#!/usr/bin/env bash
set -euo pipefail

BASE_SHA="a16522ea2594405b9a4fe47481010f704d486f76"
REPO="git@github.com:christianagbotah/eam-system.git"
FEATURE_BRANCH="fix/technician-workflow-v1"
LIVE="/home/lightworld/webapps/iassetspro"
WORK="/home/lightworld/releases/iassetspro-technician-workflow-v1"

if [ "$(id -u)" -ne 0 ]; then
  echo "STOP: run as root on the iAssetsPro VPS"
  exit 1
fi

printf '%s\n' "============================================================" \
  " iAssetsPro — TECHNICIAN WORK ORDER WORKFLOW V1" \
  "============================================================" \
  "Expected base: ${BASE_SHA}"

cd "$LIVE"
git fetch origin main
MAIN_SHA="$(git rev-parse origin/main)"
echo "origin/main:   ${MAIN_SHA}"
if [ "$MAIN_SHA" != "$BASE_SHA" ]; then
  echo "STOP: origin/main changed. Expected $BASE_SHA"
  exit 1
fi

rm -rf "$WORK"
git clone --no-checkout "$REPO" "$WORK"
cd "$WORK"
git checkout --detach "$BASE_SHA"
git switch -c "$FEATURE_BRANCH"

if [ -f "$LIVE/.env" ]; then cp "$LIVE/.env" .env; fi
if [ -f "$LIVE/.env.local" ]; then cp "$LIVE/.env.local" .env.local; fi

mkdir -p \
  prisma/migrations/20260911030000_technician_assignment_ack \
  src/app/api/work-orders/'[id]'/assignment-response \
  src/app/api/work-orders/'[id]'/pause-session \
  src/app/api/work-orders/'[id]'/execution-state \
  src/app/api/work-orders/'[id]'/execution-details \
  src/components/modules \
  src/services \
  src/__tests__/work-orders

python3 - <<'PY'
from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"STOP: {label}: expected exactly 1 anchor, found {count} in {path}")
    p.write_text(text.replace(old, new, 1))

# Prisma WorkOrder acknowledgement contract.
replace_once(
    'prisma/schema.prisma',
    "  assignmentType       String? // direct, via_supervisor\n  plannerId            String? // → User\n",
    "  assignmentType       String? // direct, via_supervisor\n"
    "  assignmentResponseStatus String @default(\"pending\") // pending, accepted, declined\n"
    "  assignmentRespondedBy String?\n"
    "  assignmentRespondedAt DateTime?\n"
    "  assignmentResponseReason String? @db.Text\n"
    "  plannerId            String? // → User\n",
    'schema assignment response fields',
)
replace_once(
    'prisma/schema.prisma',
    "  @@index([assignedTo, status])\n",
    "  @@index([assignedTo, status])\n  @@index([assignedTo, assignmentResponseStatus])\n",
    'schema assignment response index',
)

# Starting physical work requires assignment acknowledgement.
replace_once(
    'src/services/workOrderStartExecution.service.ts',
    "        assignedTo: true,\n        teamLeaderId: true,\n        assignedSupervisorId: true,\n",
    "        assignedTo: true,\n        teamLeaderId: true,\n        assignmentResponseStatus: true,\n        assignedSupervisorId: true,\n",
    'start service response field select',
)
replace_once(
    'src/services/workOrderStartExecution.service.ts',
    "    if (!hasStartAuthority(wo, session)) {\n      return {\n        success: false as const,\n        error: 'Only the assigned technician or team leader can start execution on this work order',\n      };\n    }\n\n    const readiness = await checkReadiness(workOrderId, 'start', tx);\n",
    "    if (!hasStartAuthority(wo, session)) {\n      return {\n        success: false as const,\n        error: 'Only the assigned technician or team leader can start execution on this work order',\n      };\n    }\n\n"
    "    if (wo.status === 'assigned' && wo.assignmentResponseStatus !== 'accepted') {\n"
    "      return {\n"
    "        success: false as const,\n"
    "        error: wo.assignmentResponseStatus === 'declined'\n"
    "          ? 'This assignment was declined and must be reassigned before work can start'\n"
    "          : 'Accept the work order assignment before starting execution',\n"
    "      };\n"
    "    }\n\n"
    "    const readiness = await checkReadiness(workOrderId, 'start', tx);\n",
    'start service acceptance guard',
)

# Reassignment always requires a fresh technician acknowledgement.
replace_once(
    'src/app/api/work-orders/[id]/assign/route.ts',
    "      const assignmentData = {\n        assignedTo: effectiveAssignedTo,\n        teamLeaderId: effectiveTeamLeaderId,\n        assignedSupervisorId: effectiveAssignedSupervisorId,\n        assignedBy: session.userId,\n        assignmentType,\n      };\n",
    "      const assignmentData = {\n        assignedTo: effectiveAssignedTo,\n        teamLeaderId: effectiveTeamLeaderId,\n        assignedSupervisorId: effectiveAssignedSupervisorId,\n        assignedBy: session.userId,\n        assignmentType,\n        assignmentResponseStatus: 'pending',\n        assignmentRespondedBy: null,\n        assignmentRespondedAt: null,\n        assignmentResponseReason: null,\n      };\n",
    'assignment reset acknowledgement',
)

# Server-authoritative capabilities now expose acknowledgement actions.
replace_once(
    'src/app/api/work-orders/[id]/capabilities/route.ts',
    "        plantId: true,\n        isLocked: true,\n        teamMembers: {\n",
    "        plantId: true,\n        isLocked: true,\n        assignmentResponseStatus: true,\n        assignmentRespondedAt: true,\n        assignmentResponseReason: true,\n        teamMembers: {\n",
    'capabilities assignment response select',
)
replace_once(
    'src/app/api/work-orders/[id]/capabilities/route.ts',
    "    const isAssignedExecutionActor = isAssignee || isTeamLeader;\n    const hasHoldControlAuthority = isSupervisor || isExecutionManager;\n",
    "    const isAssignedExecutionActor = isAssignee || isTeamLeader;\n"
    "    const assignmentPending = wo.status === 'assigned' && wo.assignmentResponseStatus === 'pending';\n"
    "    const assignmentAccepted = wo.assignmentResponseStatus === 'accepted';\n"
    "    const hasHoldControlAuthority = isSupervisor || isExecutionManager;\n",
    'capabilities assignment response derivation',
)
replace_once(
    'src/app/api/work-orders/[id]/capabilities/route.ts',
    "      canStart: isAssignedExecutionActor && (\n        preExecutionStatuses.includes(wo.status) ||\n        (wo.status === 'in_progress' && !hasOwnLiveSession)\n      ),\n",
    "      canAcceptAssignment: isAssignedExecutionActor && assignmentPending,\n"
    "      canDeclineAssignment: isAssignedExecutionActor && assignmentPending,\n"
    "      assignmentResponseStatus: wo.assignmentResponseStatus,\n"
    "      assignmentRespondedAt: wo.assignmentRespondedAt,\n"
    "      assignmentResponseReason: wo.assignmentResponseReason,\n"
    "      canStart: isAssignedExecutionActor && (\n"
    "        (preExecutionStatuses.includes(wo.status) && assignmentAccepted) ||\n"
    "        (wo.status === 'in_progress' && !hasOwnLiveSession)\n"
    "      ),\n",
    'capabilities start acceptance gate',
)

# Full-page navigation instead of hiding WO execution inside a side sheet.
replace_once(
    'src/components/EAMApp.tsx',
    "  'wo-detail': () => import('./modules/MaintenancePages').then(m => m.MaintenanceWorkOrdersPage),\n",
    "  'wo-detail': () => import('./modules/TechnicianWorkOrderPage').then(m => m.TechnicianWorkOrderPage),\n",
    'wo-detail full page loader',
)
replace_once(
    'src/components/modules/MaintenancePages.tsx',
    '<TableRow key={wo.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setDetailId(wo.id)}>',
    '<TableRow key={wo.id} className="cursor-pointer hover:bg-muted/30" onClick={() => navigate(\'wo-detail\', { id: wo.id })}>',
    'work-order row full page navigation',
)
replace_once(
    'src/components/modules/MaintenancePages.tsx',
    "onClick={(e) => { e.stopPropagation(); setDetailId(wo.id); }}",
    "onClick={(e) => { e.stopPropagation(); navigate('wo-detail', { id: wo.id }); }}",
    'pending-request badge full page navigation',
)
replace_once(
    'src/components/modules/MaintenancePages.tsx',
    "                <TableHead className=\"hidden md:table-cell\">Created</TableHead>\n",
    "                <TableHead className=\"hidden md:table-cell\">Created</TableHead>\n                <TableHead className=\"text-right\">Action</TableHead>\n",
    'work-order explicit action header',
)
replace_once(
    'src/components/modules/MaintenancePages.tsx',
    '<TableRow><TableCell colSpan={7} className="h-48">',
    '<TableRow><TableCell colSpan={8} className="h-48">',
    'work-order table colspan',
)
replace_once(
    'src/components/modules/MaintenancePages.tsx',
    "                  <TableCell className=\"text-xs text-muted-foreground hidden md:table-cell\">{formatDate(wo.createdAt)}</TableCell>\n",
    "                  <TableCell className=\"text-xs text-muted-foreground hidden md:table-cell\">{formatDate(wo.createdAt)}</TableCell>\n"
    "                  <TableCell className=\"text-right\">\n"
    "                    <Button variant=\"outline\" size=\"sm\" onClick={(e) => { e.stopPropagation(); navigate('wo-detail', { id: wo.id }); }}>Open Work Order</Button>\n"
    "                  </TableCell>\n",
    'work-order explicit open button',
)

# Repair old side-sheet completion payload contract while the new full page becomes primary.
replace_once(
    'src/components/modules/MaintenancePages.tsx',
    "onClick={() => handleAction('complete', { completionNotes, rootCause: completeRootCause, findings: completeFindings, correctiveAction: completeCorrectiveAction, requestSupervisorReview: completeRequestReview })}",
    "onClick={() => handleAction('complete', { completionNotes, causeDescription: completeRootCause, failureDescription: completeFindings, actionDescription: completeCorrectiveAction })}",
    'legacy completion payload field names',
)
replace_once(
    'src/components/modules/MaintenancePages.tsx',
    "            <div className=\"flex items-center gap-2\">\n              <Checkbox checked={completeRequestReview} onCheckedChange={v => setCompleteRequestReview(!!v)} id=\"request-review\" />\n              <Label htmlFor=\"request-review\" className=\"text-sm cursor-pointer\">Request Supervisor Review</Label>\n            </div>\n",
    "            <div className=\"rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground\">Completion is automatically submitted to the assigned supervisor for review.</div>\n",
    'legacy misleading supervisor review toggle',
)
replace_once(
    'src/components/modules/MaintenancePages.tsx',
    "  const [completeRequestReview, setCompleteRequestReview] = useState(true);\n",
    "",
    'remove obsolete completion review state',
)

# Replace stale live-timer calls to retrospective /time-logs endpoint.
p = Path('src/components/modules/MaintenancePages.tsx')
text = p.read_text()
start = text.find('  // Quick action handlers for start/pause/resume/complete\n')
end = text.find('  const handleAction = async (action: string, extra?: Record<string, unknown>) => {', start)
if start < 0 or end < 0:
    raise SystemExit('STOP: quick time action block anchors not found')
new_block = '''  // Quick live-execution controls use canonical lifecycle/session endpoints.\n  const handleQuickTimeAction = async (action: string, reason?: string) => {\n    setTlLoading(true);\n    let res;\n    if (action === 'start' || action === 'resume') {\n      res = await api.post(`/api/work-orders/${id}/start`, { notes: pauseNotes || undefined });\n    } else {\n      res = await api.post(`/api/work-orders/${id}/pause-session`, {\n        reason: reason || (action === 'complete' ? 'Technician ended current execution session' : 'Technician paused work'),\n        notes: pauseNotes || undefined,\n      });\n    }\n\n    if (res.success) {\n      toast.success(action === 'start' ? 'Work started — timer is running' : action === 'resume' ? 'Work resumed — timer is running' : 'Execution timer stopped');\n      setPauseDialogOpen(false);\n      setPauseReason('');\n      setPauseNotes('');\n      await fetchActiveSession();\n      await fetchWO();\n    } else {\n      toast.error(res.error || `Failed to ${action}`);\n    }\n    setTlLoading(false);\n  };\n\n'''
p.write_text(text[:start] + new_block + text[end:])

# Legacy transition menu: waiting states must never fall through to generic PUT;
# resuming from a waiting/hold state must use the canonical resume endpoint.
replace_once(
    'src/components/modules/MaintenancePages.tsx',
    "    actionName: statusToAction[t.toStatus] || t.toStatus,\n",
    "    actionName: t.toStatus === 'in_progress' && wo.status !== 'assigned' ? 'resume' : (statusToAction[t.toStatus] || t.toStatus),\n",
    'legacy transition resume mapping',
)
replace_once(
    'src/components/modules/MaintenancePages.tsx',
    "      case 'wait-parts':\n        res = await api.post(`/api/work-orders/${id}/wait-parts`, { notes: extra?.notes, ...extra });\n        break;\n      default:\n",
    "      case 'wait-parts':\n        res = await api.post(`/api/work-orders/${id}/execution-state`, { action: 'wait', targetStatus: 'waiting_parts', reason: extra?.notes || 'Waiting for parts' });\n        break;\n      case 'waiting_tools':\n      case 'waiting_shutdown':\n      case 'waiting_permit':\n        res = await api.post(`/api/work-orders/${id}/execution-state`, { action: 'wait', targetStatus: action, reason: extra?.notes || action.replaceAll('_', ' ') });\n        break;\n      default:\n",
    'legacy waiting state endpoint mapping',
)

# Frontend type contract catches up with canonical statuses and acknowledgement fields.
replace_once(
    'src/types/index.ts',
    "  status: 'draft' | 'requested' | 'approved' | 'planned' | 'assigned' | 'in_progress' | 'waiting_parts' | 'on_hold' | 'completed' | 'verified' | 'closed' | 'cancelled';\n",
    "  status: 'draft' | 'requested' | 'approved' | 'planned' | 'assigned' | 'in_progress' | 'waiting_parts' | 'waiting_tools' | 'waiting_shutdown' | 'waiting_permit' | 'on_hold' | 'pending_handover' | 'completed' | 'verified' | 'closed' | 'cancelled';\n",
    'work-order status type contract',
)
replace_once(
    'src/types/index.ts',
    "  assignmentType?: string;\n  estimatedHours?: number;\n",
    "  assignmentType?: string;\n  assignmentResponseStatus?: 'pending' | 'accepted' | 'declined';\n  assignmentRespondedBy?: string;\n  assignmentRespondedAt?: string;\n  assignmentResponseReason?: string;\n  estimatedHours?: number;\n",
    'work-order assignment response type fields',
)
PY

cat > prisma/migrations/20260911030000_technician_assignment_ack/migration.sql <<'SQL'
ALTER TABLE `work_orders`
  ADD COLUMN `assignmentResponseStatus` VARCHAR(191) NOT NULL DEFAULT 'pending' AFTER `assignmentType`,
  ADD COLUMN `assignmentRespondedBy` VARCHAR(191) NULL AFTER `assignmentResponseStatus`,
  ADD COLUMN `assignmentRespondedAt` DATETIME(3) NULL AFTER `assignmentRespondedBy`,
  ADD COLUMN `assignmentResponseReason` TEXT NULL AFTER `assignmentRespondedAt`;

CREATE INDEX `work_orders_assignedTo_assignmentResponseStatus_idx`
  ON `work_orders`(`assignedTo`, `assignmentResponseStatus`);

-- Existing work already beyond assignment is treated as historically accepted.
UPDATE `work_orders`
SET `assignmentResponseStatus` = 'accepted',
    `assignmentRespondedAt` = COALESCE(`actualStart`, `updatedAt`)
WHERE `status` IN (
  'in_progress', 'waiting_parts', 'waiting_tools', 'waiting_shutdown',
  'waiting_permit', 'on_hold', 'pending_handover', 'completed', 'verified', 'closed'
);
SQL

cat > src/services/workOrderAssignmentResponse.service.ts <<'TS'
import { db } from '@/lib/db';
import { buildAuditData } from '@/lib/audit-helpers';
import { notifyUser } from '@/lib/notifications';

export type AssignmentResponseDecision = 'accepted' | 'declined';

export interface AssignmentResponseSession {
  userId: string;
  fullName?: string;
}

export interface AssignmentResponseAuditContext {
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  plantId?: string;
  departmentId?: string;
}

type AssignmentTarget = {
  assignedTo: string | null;
  teamLeaderId: string | null;
  teamMembers: Array<{ userId: string; role: string }>;
};

export function canRespondToWorkOrderAssignment(wo: AssignmentTarget, userId: string): boolean {
  const actorIds = new Set<string>();
  if (wo.assignedTo) actorIds.add(wo.assignedTo);
  for (const member of wo.teamMembers) actorIds.add(member.userId);

  const isTeamLeader =
    wo.teamLeaderId === userId ||
    wo.teamMembers.some((member) => member.userId === userId && member.role === 'team_leader');

  if (actorIds.size > 1) return isTeamLeader;
  return wo.assignedTo === userId || isTeamLeader;
}

export async function respondToWorkOrderAssignment(
  workOrderId: string,
  decision: AssignmentResponseDecision,
  session: AssignmentResponseSession,
  options: { reason?: string; auditCtx?: AssignmentResponseAuditContext } = {},
) {
  const reason = options.reason?.trim() || null;
  if (decision === 'declined' && (!reason || reason.length < 5)) {
    return { success: false as const, statusCode: 400, error: 'A clear decline reason of at least 5 characters is required' };
  }

  const respondedAt = new Date();
  const outcome = await db.$transaction(async (tx) => {
    const wo = await tx.workOrder.findUnique({
      where: { id: workOrderId },
      select: {
        id: true,
        woNumber: true,
        title: true,
        status: true,
        isLocked: true,
        assignedTo: true,
        teamLeaderId: true,
        assignedSupervisorId: true,
        plannerId: true,
        assignedBy: true,
        assignmentResponseStatus: true,
        assignmentRespondedAt: true,
        assignmentResponseReason: true,
        teamMembers: { select: { userId: true, role: true } },
      },
    });

    if (!wo) return { success: false as const, statusCode: 404, error: 'Work order not found' };
    if (wo.isLocked) return { success: false as const, statusCode: 409, error: 'Work order is locked' };
    if (wo.status !== 'assigned') {
      return { success: false as const, statusCode: 409, error: `Assignment response is only allowed while status is assigned (current: ${wo.status})` };
    }
    if (!canRespondToWorkOrderAssignment(wo, session.userId)) {
      return { success: false as const, statusCode: 403, error: 'Only the assigned technician or accountable team leader can accept or decline this work order' };
    }

    if (wo.assignmentResponseStatus === decision) {
      return {
        success: true as const,
        data: {
          assignmentResponseStatus: decision,
          assignmentRespondedAt: wo.assignmentRespondedAt,
          assignmentResponseReason: wo.assignmentResponseReason,
          idempotent: true,
        },
        notify: null,
      };
    }

    await tx.workOrder.update({
      where: { id: workOrderId },
      data: {
        assignmentResponseStatus: decision,
        assignmentRespondedBy: session.userId,
        assignmentRespondedAt: respondedAt,
        assignmentResponseReason: decision === 'declined' ? reason : null,
      },
    });

    await tx.auditLog.create({
      data: buildAuditData(
        'update',
        'work_order',
        workOrderId,
        session.userId,
        { assignmentResponseStatus: wo.assignmentResponseStatus },
        {
          assignmentResponseStatus: decision,
          assignmentRespondedAt: respondedAt.toISOString(),
          assignmentResponseReason: decision === 'declined' ? reason : null,
        },
        options.auditCtx,
      ),
    });

    return {
      success: true as const,
      data: {
        assignmentResponseStatus: decision,
        assignmentRespondedAt: respondedAt,
        assignmentResponseReason: decision === 'declined' ? reason : null,
        idempotent: false,
      },
      notify: {
        woNumber: wo.woNumber,
        title: wo.title,
        recipients: [wo.plannerId, wo.assignedSupervisorId, wo.assignedBy].filter((id): id is string => Boolean(id)),
      },
    };
  });

  if (!outcome.success || !outcome.notify) return outcome;

  for (const userId of new Set(outcome.notify.recipients)) {
    if (userId === session.userId) continue;
    notifyUser(
      userId,
      decision === 'accepted' ? 'wo_assignment_accepted' : 'wo_assignment_declined',
      decision === 'accepted' ? 'Work Order Accepted' : 'Work Order Declined',
      decision === 'accepted'
        ? `${session.fullName || 'Technician'} accepted ${outcome.notify.woNumber}: "${outcome.notify.title}"`
        : `${session.fullName || 'Technician'} declined ${outcome.notify.woNumber}: ${reason}`,
      'work_order',
      workOrderId,
      `wo-detail?id=${workOrderId}`,
      { forceSms: decision === 'declined' },
    ).catch(() => {});
  }

  return { success: true as const, data: outcome.data };
}
TS

cat > src/app/api/work-orders/'[id]'/assignment-response/route.ts <<'TS'
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';
import { extractAuditContext } from '@/lib/audit-helpers';
import {
  respondToWorkOrderAssignment,
  type AssignmentResponseDecision,
} from '@/services/workOrderAssignmentResponse.service';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

    const { id } = await params;
    const auth = await authorizeWorkOrderPlant(request, session, id);
    if (!auth.ok) return auth.response;

    const body = await request.json() as Record<string, unknown>;
    const decision = body.response;
    if (decision !== 'accepted' && decision !== 'declined') {
      return NextResponse.json({ success: false, error: "response must be 'accepted' or 'declined'" }, { status: 400 });
    }

    const result = await respondToWorkOrderAssignment(
      id,
      decision as AssignmentResponseDecision,
      { userId: session.userId, fullName: session.fullName },
      {
        reason: typeof body.reason === 'string' ? body.reason : undefined,
        auditCtx: extractAuditContext(request),
      },
    );

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: result.statusCode });
    }
    return NextResponse.json({ success: true, data: result.data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to record assignment response';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
TS

cat > src/app/api/work-orders/'[id]'/pause-session/route.ts <<'TS'
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasAnyPermission, isAdmin } from '@/lib/auth';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';
import { closeActiveWorkSessions } from '@/services/workOrderActiveSession.service';
import { buildAuditData, extractAuditContext } from '@/lib/audit-helpers';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasAnyPermission(session, ['work_orders.start', 'work_orders.update']) && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const auth = await authorizeWorkOrderPlant(request, session, id);
    if (!auth.ok) return auth.response;

    const body = await request.json() as Record<string, unknown>;
    const reason = typeof body.reason === 'string' && body.reason.trim() ? body.reason.trim() : 'Technician paused execution';
    const endedAt = new Date();
    const auditCtx = extractAuditContext(request);

    const result = await db.$transaction(async (tx) => {
      const wo = await tx.workOrder.findUnique({
        where: { id },
        select: {
          status: true,
          assignedTo: true,
          teamLeaderId: true,
          teamMembers: { select: { userId: true, role: true } },
        },
      });
      if (!wo) return { success: false as const, statusCode: 404, error: 'Work order not found' };
      if (wo.status !== 'in_progress') {
        return { success: false as const, statusCode: 409, error: `Execution timer can only be paused while the work order is in progress (current: ${wo.status})` };
      }

      const isExecutionActor =
        wo.assignedTo === session.userId ||
        wo.teamLeaderId === session.userId ||
        wo.teamMembers.some((m) => m.userId === session.userId && m.role === 'team_leader');
      if (!isExecutionActor && !isAdmin(session)) {
        return { success: false as const, statusCode: 403, error: 'Only the assigned technician or team leader can pause this execution session' };
      }

      const closed = await closeActiveWorkSessions(tx, id, session.userId, endedAt, reason);
      if (closed.closedTimerIds.length === 0) {
        return { success: false as const, statusCode: 409, error: 'You do not have an active execution timer on this work order' };
      }

      await tx.auditLog.create({
        data: buildAuditData(
          'update',
          'work_order',
          id,
          session.userId,
          { status: 'in_progress', activeExecutionSession: true },
          { status: 'in_progress', activeExecutionSession: false, pausedAt: endedAt.toISOString(), reason, actualHours: closed.actualHours },
          auditCtx,
        ),
      });

      return { success: true as const, data: { status: 'in_progress' as const, pausedAt: endedAt, actualHours: closed.actualHours } };
    });

    if (!result.success) return NextResponse.json({ success: false, error: result.error }, { status: result.statusCode });
    return NextResponse.json({ success: true, data: result.data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to pause execution session';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
TS

cat > src/app/api/work-orders/'[id]'/execution-state/route.ts <<'TS'
import { NextRequest, NextResponse } from 'next/server';
import { getSession, hasAnyPermission, isAdmin } from '@/lib/auth';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';
import { extractAuditContext } from '@/lib/audit-helpers';
import {
  placeWorkOrderInWaitingState,
  resumeWaitingWorkOrder,
  type ExecutionStateSessionContext,
  type WaitingWorkOrderStatus,
} from '@/services/workOrderExecutionState.service';

const TECHNICIAN_WAITING_STATUSES = new Set<WaitingWorkOrderStatus>([
  'waiting_parts', 'waiting_tools', 'waiting_shutdown', 'waiting_permit',
]);

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!hasAnyPermission(session, ['work_orders.start', 'work_orders.update']) && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const { id } = await params;
    const auth = await authorizeWorkOrderPlant(request, session, id);
    if (!auth.ok) return auth.response;
    const body = await request.json() as Record<string, unknown>;
    const action = body.action;
    const auditCtx = extractAuditContext(request);

    if (action === 'resume') {
      const result = await resumeWaitingWorkOrder(id, session as ExecutionStateSessionContext, {
        reason: typeof body.reason === 'string' ? body.reason : undefined,
        auditCtx,
      });
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error, ...(result.conflict ? { conflict: result.conflict } : {}) }, { status: result.conflict ? 409 : 400 });
      }
      return NextResponse.json({ success: true, data: result.data });
    }

    if (action !== 'wait' || typeof body.targetStatus !== 'string' || !TECHNICIAN_WAITING_STATUSES.has(body.targetStatus as WaitingWorkOrderStatus)) {
      return NextResponse.json({ success: false, error: 'Provide action=wait with a valid technician waiting status, or action=resume' }, { status: 400 });
    }

    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    if (reason.length < 3) return NextResponse.json({ success: false, error: 'A reason is required' }, { status: 400 });

    const result = await placeWorkOrderInWaitingState(
      id,
      body.targetStatus as WaitingWorkOrderStatus,
      session as ExecutionStateSessionContext,
      { reason, requireExecutionAuthority: true, auditCtx },
    );
    if (!result.success) return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    return NextResponse.json({ success: true, data: result.data });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to change execution state';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
TS

cat > src/app/api/work-orders/'[id]'/execution-details/route.ts <<'TS'
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, isAdmin } from '@/lib/auth';
import { authorizeWorkOrderPlant } from '@/lib/plant-auth-helpers';
import { buildAuditData, extractAuditContext } from '@/lib/audit-helpers';

const EDITABLE_EXECUTION_STATUSES = new Set([
  'assigned', 'in_progress', 'waiting_parts', 'waiting_tools', 'waiting_shutdown',
  'waiting_permit', 'on_hold', 'pending_handover',
]);

function normalize(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  return value.trim() || null;
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    const { id } = await params;
    const auth = await authorizeWorkOrderPlant(request, session, id);
    if (!auth.ok) return auth.response;

    const wo = await db.workOrder.findUnique({
      where: { id },
      select: {
        status: true,
        isLocked: true,
        assignedTo: true,
        teamLeaderId: true,
        assignmentResponseStatus: true,
        failureDescription: true,
        causeDescription: true,
        actionDescription: true,
        teamMembers: { select: { userId: true, role: true } },
      },
    });
    if (!wo) return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    if (wo.isLocked || !EDITABLE_EXECUTION_STATUSES.has(wo.status)) {
      return NextResponse.json({ success: false, error: `Execution details cannot be edited in status ${wo.status}` }, { status: 409 });
    }

    const accountableActor =
      wo.assignedTo === session.userId ||
      wo.teamLeaderId === session.userId ||
      wo.teamMembers.some((m) => m.userId === session.userId && m.role === 'team_leader');
    if (!accountableActor && !isAdmin(session)) {
      return NextResponse.json({ success: false, error: 'Only the assigned technician or team leader can update the authoritative execution report' }, { status: 403 });
    }
    if (wo.status === 'assigned' && wo.assignmentResponseStatus !== 'accepted') {
      return NextResponse.json({ success: false, error: 'Accept the assignment before entering execution details' }, { status: 409 });
    }

    const body = await request.json() as Record<string, unknown>;
    const failureDescription = normalize(body.failureDescription);
    const causeDescription = normalize(body.causeDescription);
    const actionDescription = normalize(body.actionDescription);
    const data: Record<string, string | null> = {};
    if (failureDescription !== undefined) data.failureDescription = failureDescription;
    if (causeDescription !== undefined) data.causeDescription = causeDescription;
    if (actionDescription !== undefined) data.actionDescription = actionDescription;
    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: false, error: 'No supported execution fields supplied' }, { status: 400 });
    }

    const updated = await db.$transaction(async (tx) => {
      const result = await tx.workOrder.update({ where: { id }, data, select: { failureDescription: true, causeDescription: true, actionDescription: true, updatedAt: true } });
      await tx.auditLog.create({
        data: buildAuditData(
          'update', 'work_order', id, session.userId,
          { failureDescription: wo.failureDescription, causeDescription: wo.causeDescription, actionDescription: wo.actionDescription },
          data,
          extractAuditContext(request),
        ),
      });
      return result;
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save execution details';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
TS

cat > src/components/modules/TechnicianWorkOrderPage.tsx <<'TSX'
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowLeft, Play, Pause, CheckCircle2, XCircle, Clock3, Wrench, Package,
  Users, ShieldAlert, ClipboardList, MessageSquare, Loader2, AlertTriangle,
  RotateCcw, Save, ChevronRight, CalendarDays, UserRound, TimerReset,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useNavigationStore } from '@/stores/navigationStore';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';

interface Capabilities {
  canAcceptAssignment: boolean;
  canDeclineAssignment: boolean;
  assignmentResponseStatus: 'pending' | 'accepted' | 'declined';
  assignmentRespondedAt?: string | null;
  assignmentResponseReason?: string | null;
  canStart: boolean;
  canResume: boolean;
  resumeOpensExecutionSession: boolean;
  canRequestTools: boolean;
  canRequestMaterials: boolean;
  canRequestAssistance: boolean;
  canHandover: boolean;
  canSubmitCompletion: boolean;
  canVerify: boolean;
  canClose: boolean;
  hasActiveExecutionSession: boolean;
  isTeamLeader: boolean;
  isTeamMember: boolean;
  isSupervisor: boolean;
  isPlanner: boolean;
  isAdmin: boolean;
}

type Task = {
  id: string;
  taskNumber: number;
  description: string;
  taskType: string;
  status: string;
  findings?: string | null;
  notes?: string | null;
  completedBy?: { fullName?: string } | null;
};

const WAITING_STATUSES = ['waiting_parts', 'waiting_tools', 'waiting_shutdown', 'waiting_permit'];

function pretty(value?: string | null) {
  if (!value) return '-';
  return value.replaceAll('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(value?: string | null) {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString();
}

function formatTimer(seconds: number) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function errorText(res: any) {
  const blockers = Array.isArray(res?.blockers) ? res.blockers.map((b: any) => b.message).filter(Boolean) : [];
  return [res?.error, ...blockers].filter(Boolean).join(' — ') || 'Action failed';
}

export function TechnicianWorkOrderPage() {
  const pageParams = useNavigationStore((s) => s.pageParams);
  const navigate = useNavigationStore((s) => s.navigate);
  const goBack = useNavigationStore((s) => s.goBack);
  const user = useAuthStore((s) => s.user);
  const id = pageParams?.id;

  const [wo, setWo] = useState<any>(null);
  const [caps, setCaps] = useState<Capabilities | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [declineMode, setDeclineMode] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [pauseReason, setPauseReason] = useState('Break / temporary pause');
  const [waitingTarget, setWaitingTarget] = useState('waiting_parts');
  const [waitingReason, setWaitingReason] = useState('');
  const [completionNotes, setCompletionNotes] = useState('');
  const [failureDescription, setFailureDescription] = useState('');
  const [causeDescription, setCauseDescription] = useState('');
  const [actionDescription, setActionDescription] = useState('');
  const [comment, setComment] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [measurement, setMeasurement] = useState({ parameterKey: '', value: '', unit: '' });
  const [measurements, setMeasurements] = useState<any[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    const [woRes, capRes, taskRes, measurementRes] = await Promise.all([
      api.get(`/api/work-orders/${id}`),
      api.get(`/api/work-orders/${id}/capabilities`),
      api.get(`/api/work-orders/${id}/tasks`),
      api.get(`/api/work-orders/${id}/measurements`),
    ]);
    if (!woRes.success || !woRes.data) {
      toast.error(woRes.error || 'Unable to load work order');
      setLoading(false);
      return;
    }
    setWo(woRes.data);
    setFailureDescription(woRes.data.failureDescription || '');
    setCauseDescription(woRes.data.causeDescription || '');
    setActionDescription(woRes.data.actionDescription || '');
    if (capRes.success && capRes.data) setCaps(capRes.data as Capabilities);
    if (taskRes.success && Array.isArray(taskRes.data)) setTasks(taskRes.data as Task[]);
    if (measurementRes.success && Array.isArray(measurementRes.data)) setMeasurements(measurementRes.data);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const liveLog = useMemo(() => {
    if (!wo || !user) return null;
    return (wo.timeLogs || []).find((log: any) =>
      log.userId === user.id && ['start', 'resume'].includes(log.action) && !log.endTime,
    ) || null;
  }, [wo, user]);

  useEffect(() => {
    if (!liveLog) { setElapsed(0); return; }
    const start = new Date(liveLog.startTime || liveLog.timestamp).getTime();
    const tick = () => setElapsed((Date.now() - start) / 1000);
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [liveLog]);

  const perform = async (key: string, fn: () => Promise<any>, success: string) => {
    setBusy(key);
    try {
      const res = await fn();
      if (!res.success) { toast.error(errorText(res)); return false; }
      toast.success(success);
      await load();
      return true;
    } finally {
      setBusy(null);
    }
  };

  const respondAssignment = async (response: 'accepted' | 'declined') => {
    if (!id) return;
    const ok = await perform(
      `assignment-${response}`,
      () => api.post(`/api/work-orders/${id}/assignment-response`, {
        response,
        ...(response === 'declined' ? { reason: declineReason } : {}),
      }),
      response === 'accepted' ? 'Assignment accepted. Review the job and start when ready.' : 'Assignment declined and returned for reassignment.',
    );
    if (ok) { setDeclineMode(false); setDeclineReason(''); }
  };

  const startWork = () => id && perform('start', () => api.post(`/api/work-orders/${id}/start`, { notes: wo?.actualStart ? 'Technician resumed work' : 'Technician started work' }), wo?.actualStart ? 'Work resumed — timer running' : 'Work started — timer running');

  const pauseWork = () => id && perform('pause', () => api.post(`/api/work-orders/${id}/pause-session`, { reason: pauseReason }), 'Execution timer paused');

  const moveToWaiting = () => {
    if (!id) return;
    if (waitingReason.trim().length < 3) { toast.error('Enter a reason for the waiting state'); return; }
    perform('waiting', () => api.post(`/api/work-orders/${id}/execution-state`, {
      action: 'wait', targetStatus: waitingTarget, reason: waitingReason.trim(),
    }), `Work order moved to ${pretty(waitingTarget)}`);
  };

  const resumeWaiting = () => id && perform('resume-waiting', () => api.post(`/api/work-orders/${id}/execution-state`, { action: 'resume', reason: 'Technician resumed execution' }), 'Work resumed');

  const saveExecution = () => id && perform('save-execution', () => api.patch(`/api/work-orders/${id}/execution-details`, {
    failureDescription, causeDescription, actionDescription,
  }), 'Execution report saved');

  const updateTask = (task: Task, status: string) => id && perform(`task-${task.id}`, () => api.patch(`/api/work-orders/${id}/tasks/${task.id}`, { status }), 'Task updated');

  const addComment = async () => {
    if (!id || !comment.trim()) return;
    const ok = await perform('comment', () => api.post(`/api/work-orders/${id}/comments`, { content: comment.trim() }), 'Note added');
    if (ok) setComment('');
  };

  const addMeasurement = async () => {
    if (!id || !measurement.parameterKey.trim() || !measurement.unit.trim() || !measurement.value.trim()) {
      toast.error('Parameter, value and unit are required'); return;
    }
    const value = Number(measurement.value);
    if (!Number.isFinite(value)) { toast.error('Measurement value must be numeric'); return; }
    const ok = await perform('measurement', () => api.post(`/api/work-orders/${id}/measurements`, {
      parameterKey: measurement.parameterKey.trim(), value, unit: measurement.unit.trim(),
    }), 'Measurement recorded');
    if (ok) setMeasurement({ parameterKey: '', value: '', unit: '' });
  };

  const submitCompletion = () => {
    if (!id) return;
    if (!completionNotes.trim()) { toast.error('Completion notes are required'); return; }
    perform('complete', () => api.post(`/api/work-orders/${id}/complete`, {
      notes: completionNotes.trim(),
      failureDescription: failureDescription.trim() || undefined,
      causeDescription: causeDescription.trim() || undefined,
      actionDescription: actionDescription.trim() || undefined,
    }), 'Completion submitted for supervisor review');
  };

  const reviewAction = (kind: 'verify' | 'close') => id && perform(kind, () => api.post(`/api/work-orders/${id}/${kind}`, { notes: kind === 'verify' ? 'Supervisor verified completed work' : 'Planner closed verified work' }), kind === 'verify' ? 'Work order verified' : 'Work order closed');

  if (!id) return <div className="p-6"><Card><CardContent className="p-6">No work order selected.</CardContent></Card></div>;
  if (loading) return <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading work order workspace...</div>;
  if (!wo) return <div className="p-6">Work order could not be loaded.</div>;

  const assignmentStatus = caps?.assignmentResponseStatus || wo.assignmentResponseStatus || 'pending';
  const inWaitingState = WAITING_STATUSES.includes(wo.status) || wo.status === 'on_hold';
  const taskDone = tasks.filter((t) => t.status === 'completed').length;
  const taskProgress = tasks.length ? Math.round((taskDone / tasks.length) * 100) : 0;

  return (
    <div className="space-y-5 pb-12">
      <div className="sticky top-0 z-20 -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 bg-background/95 backdrop-blur border-b">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <button onClick={goBack} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1"><ArrowLeft className="h-3.5 w-3.5" />Back to work orders</button>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-xs font-semibold text-muted-foreground">{wo.woNumber}</span>
              <Badge variant="outline">{pretty(wo.status)}</Badge>
              <Badge variant={wo.priority === 'critical' || wo.priority === 'emergency' ? 'destructive' : 'secondary'}>{pretty(wo.priority)}</Badge>
              {assignmentStatus === 'accepted' && <Badge className="bg-emerald-600">Assignment Accepted</Badge>}
              {assignmentStatus === 'declined' && <Badge variant="destructive">Assignment Declined</Badge>}
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold truncate mt-1">{wo.title}</h1>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {liveLog && (
              <div className="rounded-xl border bg-emerald-50 px-4 py-2 dark:bg-emerald-950/30">
                <div className="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Live work timer</div>
                <div className="font-mono text-xl font-bold text-emerald-700 dark:text-emerald-300">{formatTimer(elapsed)}</div>
              </div>
            )}
            {caps?.canStart && !liveLog && <Button onClick={startWork} disabled={busy !== null} className="bg-emerald-600 hover:bg-emerald-700"><Play className="h-4 w-4 mr-1" />{wo.actualStart ? 'Resume Work' : 'Start Work'}</Button>}
            {liveLog && <Button variant="outline" onClick={pauseWork} disabled={busy !== null}><Pause className="h-4 w-4 mr-1" />Pause Timer</Button>}
            {caps?.canResume && inWaitingState && <Button onClick={resumeWaiting} disabled={busy !== null}><RotateCcw className="h-4 w-4 mr-1" />Resume Work</Button>}
          </div>
        </div>
      </div>

      {wo.status === 'assigned' && assignmentStatus === 'pending' && (caps?.canAcceptAssignment || caps?.canDeclineAssignment) && (
        <Card className="border-sky-200 bg-sky-50/50 dark:bg-sky-950/20">
          <CardContent className="p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="font-semibold">New work order assignment</p>
                <p className="text-sm text-muted-foreground mt-1">Review the job, safety requirements, planned resources and schedule before accepting. Accepting does not start labor time.</p>
              </div>
              <div className="flex gap-2 shrink-0">
                {caps.canAcceptAssignment && <Button onClick={() => respondAssignment('accepted')} disabled={busy !== null} className="bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="h-4 w-4 mr-1" />Accept Assignment</Button>}
                {caps.canDeclineAssignment && <Button variant="destructive" onClick={() => setDeclineMode(true)} disabled={busy !== null}><XCircle className="h-4 w-4 mr-1" />Decline</Button>}
              </div>
            </div>
            {declineMode && (
              <div className="mt-4 grid gap-2 max-w-2xl">
                <Label>Reason for declining *</Label>
                <Textarea value={declineReason} onChange={(e) => setDeclineReason(e.target.value)} placeholder="Example: incorrect trade assignment, unavailable, safety qualification required..." />
                <div className="flex gap-2"><Button variant="outline" onClick={() => setDeclineMode(false)}>Cancel</Button><Button variant="destructive" disabled={declineReason.trim().length < 5 || busy !== null} onClick={() => respondAssignment('declined')}>Confirm Decline</Button></div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {assignmentStatus === 'declined' && wo.status === 'assigned' && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:bg-red-950/20 dark:text-red-300">
          <strong>Awaiting reassignment.</strong> {caps?.assignmentResponseReason || wo.assignmentResponseReason || 'This assignment was declined.'}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 space-y-5">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Wrench className="h-4 w-4" />Work Order & Problem</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                <div><p className="text-xs text-muted-foreground">Asset / Machine</p><p className="font-medium">{wo.assetName || wo.maintenanceRequest?.asset?.name || '-'}</p></div>
                <div><p className="text-xs text-muted-foreground">Type</p><p className="font-medium">{pretty(wo.type)}</p></div>
                <div><p className="text-xs text-muted-foreground">Trade</p><p className="font-medium">{pretty(wo.tradeActivity)}</p></div>
                <div><p className="text-xs text-muted-foreground">Estimated Time</p><p className="font-medium">{wo.estimatedHours ? `${wo.estimatedHours} h` : '-'}</p></div>
              </div>
              <Separator />
              <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Problem / Scope</p><p className="mt-1 whitespace-pre-wrap text-sm">{wo.description || wo.maintenanceRequest?.description || 'No description provided.'}</p></div>
              {wo.notes && <div className="rounded-lg bg-muted/40 p-3"><p className="text-xs font-medium">Planner / Work Order Notes</p><p className="text-sm mt-1 whitespace-pre-wrap">{wo.notes}</p></div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><ClipboardList className="h-4 w-4" />Task Checklist <Badge variant="outline">{taskDone}/{tasks.length} · {taskProgress}%</Badge></CardTitle></CardHeader>
            <CardContent>
              {tasks.length === 0 ? <p className="text-sm text-muted-foreground">No task checklist has been added to this work order.</p> : (
                <div className="space-y-2">
                  {tasks.map((task) => (
                    <div key={task.id} className="flex items-start gap-3 rounded-lg border p-3">
                      <button disabled={busy !== null} onClick={() => updateTask(task, task.status === 'completed' ? 'pending' : 'completed')} className={`mt-0.5 h-5 w-5 rounded border flex items-center justify-center ${task.status === 'completed' ? 'bg-emerald-600 border-emerald-600 text-white' : ''}`}>{task.status === 'completed' && <CheckCircle2 className="h-3.5 w-3.5" />}</button>
                      <div className="min-w-0 flex-1"><p className={`text-sm font-medium ${task.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>{task.taskNumber}. {task.description}</p><p className="text-xs text-muted-foreground mt-0.5">{pretty(task.taskType)} · {pretty(task.status)}</p>{task.findings && <p className="text-xs mt-1">Finding: {task.findings}</p>}</div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Save className="h-4 w-4" />Execution Report</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div><Label>Findings / Failure Description</Label><Textarea className="mt-1" rows={3} value={failureDescription} onChange={(e) => setFailureDescription(e.target.value)} placeholder="What did you find during inspection and repair?" /></div>
              <div><Label>Root Cause</Label><Textarea className="mt-1" rows={3} value={causeDescription} onChange={(e) => setCauseDescription(e.target.value)} placeholder="What caused the problem?" /></div>
              <div><Label>Corrective Action / Work Performed</Label><Textarea className="mt-1" rows={4} value={actionDescription} onChange={(e) => setActionDescription(e.target.value)} placeholder="Describe repairs, adjustments, replacements and tests performed..." /></div>
              <Button variant="outline" onClick={saveExecution} disabled={busy !== null || assignmentStatus !== 'accepted'}><Save className="h-4 w-4 mr-1" />Save Progress</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><TimerReset className="h-4 w-4" />Measurements & Readings</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-4 gap-2">
                <Input placeholder="Parameter e.g. vibration" value={measurement.parameterKey} onChange={(e) => setMeasurement((m) => ({ ...m, parameterKey: e.target.value }))} />
                <Input placeholder="Value" value={measurement.value} onChange={(e) => setMeasurement((m) => ({ ...m, value: e.target.value }))} />
                <Input placeholder="Unit e.g. mm/s" value={measurement.unit} onChange={(e) => setMeasurement((m) => ({ ...m, unit: e.target.value }))} />
                <Button variant="outline" onClick={addMeasurement} disabled={busy !== null}>Record Reading</Button>
              </div>
              {measurements.length > 0 && <div className="grid sm:grid-cols-2 gap-2">{measurements.slice(0, 6).map((m: any) => <div key={m.id} className="rounded-lg border p-3 text-sm"><div className="flex justify-between gap-2"><span className="font-medium">{m.parameterKey}</span><span className={m.isAlarm ? 'text-red-600 font-semibold' : ''}>{m.value} {m.unit}</span></div><p className="text-xs text-muted-foreground mt-1">{m.component?.name || 'Linked component'} · {formatDate(m.recordedAt)}</p></div>)}</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><MessageSquare className="h-4 w-4" />Work Notes & Communication</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2"><Input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a work note, observation or message..." onKeyDown={(e) => { if (e.key === 'Enter') addComment(); }} /><Button variant="outline" onClick={addComment} disabled={busy !== null || !comment.trim()}>Add Note</Button></div>
              {(wo.comments || []).slice(0, 6).map((c: any) => <div key={c.id} className="rounded-lg bg-muted/40 p-3 text-sm"><div className="flex justify-between gap-3 text-xs text-muted-foreground"><span>{c.user?.fullName || 'User'}</span><span>{formatDate(c.createdAt)}</span></div><p className="mt-1 whitespace-pre-wrap">{c.content}</p></div>)}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><UserRound className="h-4 w-4" />Assignment</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Assigned Technician</p><p className="font-medium">{wo.assignee?.fullName || '-'}</p></div>
              <div><p className="text-xs text-muted-foreground">Team Leader</p><p className="font-medium">{wo.teamLeader?.fullName || wo.assignee?.fullName || '-'}</p></div>
              <div><p className="text-xs text-muted-foreground">Supervisor</p><p className="font-medium">{wo.assignedSupervisor?.fullName || '-'}</p></div>
              <div><p className="text-xs text-muted-foreground">Planner</p><p className="font-medium">{wo.planner?.fullName || '-'}</p></div>
              {(wo.teamMembers || []).length > 1 && <><Separator /><div className="space-y-1">{wo.teamMembers.map((m: any) => <div key={m.id} className="flex justify-between gap-2"><span>{m.user?.fullName || m.userId}</span><Badge variant="outline">{pretty(m.role)}</Badge></div>)}</div></>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldAlert className="h-4 w-4" />Safety & Readiness</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div><p className="text-xs text-muted-foreground">Safety / LOTO Notes</p><p className="whitespace-pre-wrap">{wo.safetyNotes || 'No specific safety notes recorded.'}</p></div>
              <div><p className="text-xs text-muted-foreground">Required PPE</p><p>{wo.ppeRequired || 'Use site-standard PPE.'}</p></div>
              {wo.maintenanceRequest?.machineDownStatus && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700"><AlertTriangle className="h-4 w-4 inline mr-1" />Machine / equipment reported down</div>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4" />Schedule & Labor</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">Planned Start</span><span>{formatDate(wo.plannedStart)}</span></div>
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">Planned End</span><span>{formatDate(wo.plannedEnd)}</span></div>
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">Actual Start</span><span>{formatDate(wo.actualStart)}</span></div>
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">Recorded Labor</span><span>{Number(wo.actualHours || 0).toFixed(2)} h</span></div>
              <Button variant="ghost" className="w-full justify-between" onClick={() => navigate('technician-timesheet', { workOrderId: id })}>Open Timesheet <ChevronRight className="h-4 w-4" /></Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Package className="h-4 w-4" />Resources</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <Button variant="outline" className="w-full justify-between" onClick={() => navigate('repairs-material-requests', { workOrderId: id })}>Materials <Badge variant="secondary">{wo.repairMaterialRequests?.length || 0}</Badge></Button>
              <Button variant="outline" className="w-full justify-between" onClick={() => navigate('repairs-tool-requests', { workOrderId: id })}>Tools <Badge variant="secondary">{wo.repairToolRequests?.length || 0}</Badge></Button>
              <Button variant="outline" className="w-full justify-between" onClick={() => navigate('maintenance-work-orders', { id })}>Team / Assistance <Users className="h-4 w-4" /></Button>
            </CardContent>
          </Card>

          {wo.status === 'in_progress' && liveLog && (
            <Card className="border-amber-200">
              <CardHeader><CardTitle className="text-base">Pause / Waiting State</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div><Label>Timer Pause Reason</Label><Input className="mt-1" value={pauseReason} onChange={(e) => setPauseReason(e.target.value)} /></div>
                <Button variant="outline" className="w-full" onClick={pauseWork} disabled={busy !== null}><Pause className="h-4 w-4 mr-1" />Pause My Timer</Button>
                <Separator />
                <Label>Work Order Waiting State</Label>
                <select className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={waitingTarget} onChange={(e) => setWaitingTarget(e.target.value)}>
                  <option value="waiting_parts">Waiting for Parts</option><option value="waiting_tools">Waiting for Tools</option><option value="waiting_shutdown">Waiting for Shutdown</option><option value="waiting_permit">Waiting for Permit</option>
                </select>
                <Textarea value={waitingReason} onChange={(e) => setWaitingReason(e.target.value)} placeholder="Why must execution stop?" />
                <Button variant="secondary" className="w-full" onClick={moveToWaiting} disabled={busy !== null}>Move Work Order to Waiting</Button>
              </CardContent>
            </Card>
          )}

          {caps?.canSubmitCompletion && (
            <Card className="border-emerald-200 bg-emerald-50/30 dark:bg-emerald-950/10">
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-emerald-600" />Complete & Submit</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">Stop the live timer first. The server will verify open tools, materials, handovers and assistance requests before accepting completion.</p>
                <Textarea value={completionNotes} onChange={(e) => setCompletionNotes(e.target.value)} placeholder="Final completion summary *" rows={4} />
                <Button className="w-full bg-emerald-600 hover:bg-emerald-700" onClick={submitCompletion} disabled={busy !== null || !completionNotes.trim()}>Submit for Supervisor Review</Button>
              </CardContent>
            </Card>
          )}

          {caps?.canVerify && <Button className="w-full" onClick={() => reviewAction('verify')} disabled={busy !== null}>Verify Completed Work</Button>}
          {caps?.canClose && <Button className="w-full" onClick={() => reviewAction('close')} disabled={busy !== null}>Close Work Order</Button>}
        </div>
      </div>
    </div>
  );
}
TSX

cat > src/__tests__/work-orders/technician-workflow-contract.test.ts <<'TS'
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const read = (path: string) => fs.readFileSync(path, 'utf8');

describe('technician work-order vertical slice contract', () => {
  it('separates assignment acknowledgement from execution start', () => {
    const schema = read('prisma/schema.prisma');
    const start = read('src/services/workOrderStartExecution.service.ts');
    const capability = read('src/app/api/work-orders/[id]/capabilities/route.ts');
    const assignment = read('src/app/api/work-orders/[id]/assignment-response/route.ts');
    expect(schema).toContain('assignmentResponseStatus String @default("pending")');
    expect(start).toContain("wo.assignmentResponseStatus !== 'accepted'");
    expect(capability).toContain('canAcceptAssignment');
    expect(capability).toContain('canDeclineAssignment');
    expect(assignment).toContain("response must be 'accepted' or 'declined'");
  });

  it('uses a dedicated full work-order workspace and canonical live-session endpoints', () => {
    const app = read('src/components/EAMApp.tsx');
    const page = read('src/components/modules/TechnicianWorkOrderPage.tsx');
    const maintenance = read('src/components/modules/MaintenancePages.tsx');
    expect(app).toContain("'wo-detail': () => import('./modules/TechnicianWorkOrderPage')");
    expect(maintenance).toContain('Open Work Order');
    expect(page).toContain('/assignment-response');
    expect(page).toContain('/pause-session');
    expect(page).toContain('/execution-state');
    expect(page).toContain('/execution-details');
    expect(page).toContain('failureDescription: failureDescription.trim()');
    expect(page).toContain('causeDescription: causeDescription.trim()');
    expect(page).toContain('actionDescription: actionDescription.trim()');
  });

  it('keeps assignment reset and schema migration explicit', () => {
    const assign = read('src/app/api/work-orders/[id]/assign/route.ts');
    const migration = read('prisma/migrations/20260911030000_technician_assignment_ack/migration.sql');
    expect(assign).toContain("assignmentResponseStatus: 'pending'");
    expect(assign).toContain('assignmentRespondedAt: null');
    expect(migration).toContain('ADD COLUMN `assignmentResponseStatus`');
    expect(migration).toContain("'in_progress', 'waiting_parts', 'waiting_tools'");
  });

  it('does not send live pause/resume through retrospective time-log creation', () => {
    const maintenance = read('src/components/modules/MaintenancePages.tsx');
    const quickStart = maintenance.indexOf('// Quick live-execution controls use canonical lifecycle/session endpoints.');
    const nextHandler = maintenance.indexOf('const handleAction = async', quickStart);
    const quickBlock = maintenance.slice(quickStart, nextHandler);
    expect(quickBlock).toContain('/pause-session');
    expect(quickBlock).toContain('/start');
    expect(quickBlock).not.toContain('/time-logs');
  });
});
TS

printf '%s\n' "[1/4] Review intended diff"
git diff --check
CHANGED="$(git status --short)"
echo "$CHANGED"

printf '%s\n' "[2/4] Install, generate Prisma and validate focused workflow"
bun install --frozen-lockfile
bunx prisma validate
bunx prisma generate
bunx vitest run \
  src/__tests__/work-orders/technician-workflow-contract.test.ts \
  src/components/modules/__tests__/create-maintenance-request-ux.test.ts

printf '%s\n' "[3/4] TypeScript and full production build"
bunx tsc -p tsconfig.repairs.json --noEmit
bun run build

printf '%s\n' "[4/4] Commit and push feature branch"
git add \
  prisma/schema.prisma \
  prisma/migrations/20260911030000_technician_assignment_ack/migration.sql \
  src/services/workOrderAssignmentResponse.service.ts \
  src/services/workOrderStartExecution.service.ts \
  src/app/api/work-orders/'[id]'/assign/route.ts \
  src/app/api/work-orders/'[id]'/capabilities/route.ts \
  src/app/api/work-orders/'[id]'/assignment-response/route.ts \
  src/app/api/work-orders/'[id]'/pause-session/route.ts \
  src/app/api/work-orders/'[id]'/execution-state/route.ts \
  src/app/api/work-orders/'[id]'/execution-details/route.ts \
  src/components/EAMApp.tsx \
  src/components/modules/MaintenancePages.tsx \
  src/components/modules/TechnicianWorkOrderPage.tsx \
  src/types/index.ts \
  src/__tests__/work-orders/technician-workflow-contract.test.ts

git diff --cached --check
git commit -m "Build technician work order execution workspace"
git push -u origin "$FEATURE_BRANCH"

NEW_SHA="$(git rev-parse HEAD)"
printf '%s\n' \
  "============================================================" \
  " iAssetsPro TECHNICIAN WORKFLOW V1 PUSHED" \
  "============================================================" \
  "$NEW_SHA" \
  "Feature: $FEATURE_BRANCH" \
  "Clone:   $WORK" \
  "Production and the production database were NOT modified by this helper."
