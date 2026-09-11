#!/usr/bin/env bash
set -euo pipefail

REPO="git@github.com:christianagbotah/eam-system.git"
FEATURE_BRANCH="fix/technician-workflow-v1"
EXPECTED_REMOTE="d3ffe3f1d0f6303a4a9c3fc58b089603231e77ec"
WORK="/home/lightworld/releases/iassetspro-technician-workflow-v1"

if [ "$(id -u)" -ne 0 ]; then
  echo "STOP: run as root on the iAssetsPro VPS"
  exit 1
fi

printf '%s\n' \
  "============================================================" \
  " iAssetsPro — TECHNICIAN WORKFLOW V1 CORRECTION" \
  "============================================================" \
  "Expected remote feature head: ${EXPECTED_REMOTE}"

# The temporary npm IPv4 pin is no longer needed now that dependencies are installed.
if [ -f /etc/hosts.iassetspro-before-bun ]; then
  echo "Restoring /etc/hosts from the temporary Bun IPv4 workaround..."
  cp -a /etc/hosts.iassetspro-before-bun /etc/hosts
  rm -f /etc/hosts.iassetspro-before-bun
fi

if [ ! -d "$WORK/.git" ]; then
  echo "STOP: validated workflow workspace does not exist: $WORK"
  exit 1
fi

cd "$WORK"
git fetch origin "$FEATURE_BRANCH"
REMOTE_SHA="$(git rev-parse "origin/$FEATURE_BRANCH")"
echo "Remote feature: $REMOTE_SHA"
if [ "$REMOTE_SHA" != "$EXPECTED_REMOTE" ]; then
  echo "STOP: feature branch moved. Expected $EXPECTED_REMOTE"
  exit 1
fi

# Use the already-pushed candidate as the authoritative base. The local bd574138
# duplicate was produced by re-running the deterministic helper and must never be
# force-pushed over an existing remote branch.
git reset --hard
git switch -C "$FEATURE_BRANCH" "origin/$FEATURE_BRANCH"

AVAILABLE_KB="$(df -Pk / | awk 'NR==2 {print $4}')"
if [ "$AVAILABLE_KB" -lt 6291456 ]; then
  echo "STOP: less than 6 GiB free on /. Free space before rebuilding."
  df -h /
  exit 1
fi

echo "[1/5] Apply post-build workflow/UX corrections"
python3 - <<'PY'
from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str):
    p = Path(path)
    text = p.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"STOP: {label}: expected 1 anchor, found {count} in {path}")
    p.write_text(text.replace(old, new, 1))

# ---------------------------------------------------------------------------
# 1. Keep capability UI exactly aligned with authoritative multi-tech response
#    rules. In a multi-worker assignment only the accountable team leader may
#    accept/decline on behalf of the team.
# ---------------------------------------------------------------------------
replace_once(
    'src/app/api/work-orders/[id]/capabilities/route.ts',
    "    const isTeamLeader = isTeamLeaderFromField || isTeamLeaderFromMembers;\n"
    "    const isAssignedExecutionActor = isAssignee || isTeamLeader;\n"
    "    const assignmentPending = wo.status === 'assigned' && wo.assignmentResponseStatus === 'pending';\n"
    "    const assignmentAccepted = wo.assignmentResponseStatus === 'accepted';\n",
    "    const isTeamLeader = isTeamLeaderFromField || isTeamLeaderFromMembers;\n"
    "    const isAssignedExecutionActor = isAssignee || isTeamLeader;\n"
    "    const assignmentActorIds = new Set<string>();\n"
    "    if (wo.assignedTo) assignmentActorIds.add(wo.assignedTo);\n"
    "    for (const member of wo.teamMembers ?? []) assignmentActorIds.add(member.userId);\n"
    "    const isAccountableAssignmentResponder = assignmentActorIds.size > 1\n"
    "      ? isTeamLeader\n"
    "      : isAssignedExecutionActor;\n"
    "    const assignmentPending = wo.status === 'assigned' && wo.assignmentResponseStatus === 'pending';\n"
    "    const assignmentAccepted = wo.assignmentResponseStatus === 'accepted';\n",
    'capabilities accountable responder',
)
replace_once(
    'src/app/api/work-orders/[id]/capabilities/route.ts',
    "      canAcceptAssignment: isAssignedExecutionActor && assignmentPending,\n"
    "      canDeclineAssignment: isAssignedExecutionActor && assignmentPending,\n",
    "      canAcceptAssignment: isAccountableAssignmentResponder && assignmentPending,\n"
    "      canDeclineAssignment: isAccountableAssignmentResponder && assignmentPending,\n",
    'capabilities acknowledgement buttons',
)
replace_once(
    'src/app/api/work-orders/[id]/capabilities/route.ts',
    "      canRequestAssistance: (isAssignee || isTeamMember || isTeamLeader) && activeExecutionStatuses.includes(wo.status),\n",
    "      canRequestAssistance: (isAssignee || isTeamMember || isTeamLeader) && (\n"
    "        activeExecutionStatuses.includes(wo.status) ||\n"
    "        (wo.status === 'assigned' && assignmentAccepted)\n"
    "      ),\n",
    'allow accepted pre-start assistance request',
)

# ---------------------------------------------------------------------------
# 2. Surface the original maintenance-request location on the technician page.
# ---------------------------------------------------------------------------
replace_once(
    'src/app/api/work-orders/[id]/route.ts',
    "          machineDownStatus: true,\n          createdAt: true,\n",
    "          machineDownStatus: true,\n          location: true,\n          createdAt: true,\n",
    'WO detail maintenance-request location',
)

# ---------------------------------------------------------------------------
# 3. Work-order evidence: technicians with view_own must be able to see their
#    own evidence; only writable execution actors/managers may upload it.
# ---------------------------------------------------------------------------
Path('src/app/api/work-orders/[id]/attachments/route.ts').write_text(r'''import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';
import { ObjectStorageService } from '@/services/objectStorage.service';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { id: workOrderId } = await params;
    const wo = await db.workOrder.findUnique({
      where: { id: workOrderId },
      select: {
        id: true,
        status: true,
        isLocked: true,
        plantId: true,
        assignedTo: true,
        teamLeaderId: true,
        teamMembers: { select: { userId: true, accessLevel: true } },
      },
    });
    if (!wo) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess || !canAccessPlantStrict(plantScope, wo.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const isWritableExecutionActor =
      wo.assignedTo === session.userId ||
      wo.teamLeaderId === session.userId ||
      wo.teamMembers.some((member) => member.userId === session.userId && member.accessLevel !== 'read_only');
    const canManage = isAdmin(session) || hasPermission(session, 'work_orders.update');
    if (!isWritableExecutionActor && !canManage) {
      return NextResponse.json({ success: false, error: 'Only assigned execution staff or authorized maintenance management can upload work-order evidence' }, { status: 403 });
    }

    if (wo.isLocked || wo.status === 'closed') {
      return NextResponse.json({ success: false, error: 'Work order is locked and cannot be modified' }, { status: 409 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const description = (formData.get('description') as string) || null;
    const category = (formData.get('category') as string) || null;
    if (!file) {
      return NextResponse.json({ success: false, error: 'File is required' }, { status: 400 });
    }

    const validation = ObjectStorageService.validateUpload(file.type, file.size);
    if (!validation.valid) {
      return NextResponse.json({ success: false, error: validation.error }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const key = ObjectStorageService.generateKey(`work-orders/${workOrderId}`, file.name);
    const uploadResult = await ObjectStorageService.upload(key, buffer, file.type);
    const finalDescription = category
      ? `[${category}]${description ? ' ' + description : ''}`
      : description;

    const attachment = await db.attachment.create({
      data: {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        filePath: uploadResult.key,
        entityType: 'work_order',
        entityId: workOrderId,
        uploadedById: session.userId,
        description: finalDescription,
      },
      include: { uploadedBy: { select: { id: true, fullName: true, username: true } } },
    });

    return NextResponse.json({ success: true, data: attachment }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to upload attachment';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { id: workOrderId } = await params;
    const wo = await db.workOrder.findUnique({
      where: { id: workOrderId },
      select: {
        plantId: true,
        assignedTo: true,
        teamMembers: { select: { userId: true } },
        maintenanceRequest: { select: { requestedBy: true } },
      },
    });
    if (!wo) {
      return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess || !canAccessPlantStrict(plantScope, wo.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const canViewAll =
      isAdmin(session) ||
      hasPermission(session, 'work_orders.view') ||
      hasPermission(session, 'work_orders.view_all');
    const isOwn =
      wo.assignedTo === session.userId ||
      wo.teamMembers.some((member) => member.userId === session.userId) ||
      wo.maintenanceRequest?.requestedBy === session.userId;
    const canViewOwn = hasPermission(session, 'work_orders.view_own') && isOwn;
    if (!canViewAll && !canViewOwn) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || undefined;
    const where: Record<string, unknown> = {
      entityType: 'work_order',
      entityId: workOrderId,
    };
    if (category) where.description = { startsWith: `[${category}]` };

    const attachments = await db.attachment.findMany({
      where,
      orderBy: { uploadedAt: 'desc' },
      include: { uploadedBy: { select: { id: true, fullName: true, username: true } } },
      take: 200,
    });

    return NextResponse.json({ success: true, data: attachments });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch attachments';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
''')

# Secure, work-order-scoped binary download route. Do not expose evidence through
# the generic public /api/files path.
download_dir = Path('src/app/api/work-orders/[id]/attachments/[attachmentId]')
download_dir.mkdir(parents=True, exist_ok=True)
(download_dir / 'route.ts').write_text(r'''import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';
import { ObjectStorageService } from '@/services/objectStorage.service';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { id, attachmentId } = await params;
    const wo = await db.workOrder.findUnique({
      where: { id },
      select: {
        plantId: true,
        assignedTo: true,
        teamMembers: { select: { userId: true } },
        maintenanceRequest: { select: { requestedBy: true } },
      },
    });
    if (!wo) return NextResponse.json({ success: false, error: 'Work order not found' }, { status: 404 });

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess || !canAccessPlantStrict(plantScope, wo.plantId)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const canViewAll =
      isAdmin(session) ||
      hasPermission(session, 'work_orders.view') ||
      hasPermission(session, 'work_orders.view_all');
    const isOwn =
      wo.assignedTo === session.userId ||
      wo.teamMembers.some((member) => member.userId === session.userId) ||
      wo.maintenanceRequest?.requestedBy === session.userId;
    if (!canViewAll && !(hasPermission(session, 'work_orders.view_own') && isOwn)) {
      return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
    }

    const attachment = await db.attachment.findUnique({
      where: { id: attachmentId },
      select: { entityType: true, entityId: true, filePath: true, fileName: true, fileType: true },
    });
    if (!attachment || attachment.entityType !== 'work_order' || attachment.entityId !== id) {
      return NextResponse.json({ success: false, error: 'Attachment not found' }, { status: 404 });
    }

    const stored = await ObjectStorageService.download(attachment.filePath);
    if (!stored) return NextResponse.json({ success: false, error: 'Evidence file not found' }, { status: 404 });

    const safeName = attachment.fileName.replace(/["\r\n]/g, '_');
    const inline = attachment.fileType.startsWith('image/') || attachment.fileType === 'application/pdf';
    return new NextResponse(stored.buffer, {
      status: 200,
      headers: {
        'Content-Type': attachment.fileType || stored.mimeType,
        'Content-Length': String(stored.buffer.length),
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${safeName}"`,
        'Cache-Control': 'private, max-age=300',
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to download work-order evidence';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
''')

# ---------------------------------------------------------------------------
# 4. Technician full-page workspace UX completion: evidence, assistance,
#    handover, location, and accurate release-vs-resume wording.
# ---------------------------------------------------------------------------
page = Path('src/components/modules/TechnicianWorkOrderPage.tsx')
text = page.read_text()

old_icons = """  ArrowLeft, Play, Pause, CheckCircle2, XCircle, Clock3, Wrench, Package,\n  Users, ShieldAlert, ClipboardList, MessageSquare, Loader2, AlertTriangle,\n  RotateCcw, Save, ChevronRight, CalendarDays, UserRound, TimerReset,\n"""
new_icons = """  ArrowLeft, Play, Pause, CheckCircle2, XCircle, Clock3, Wrench, Package,\n  Users, ShieldAlert, ClipboardList, MessageSquare, Loader2, AlertTriangle,\n  RotateCcw, Save, ChevronRight, CalendarDays, UserRound, TimerReset,\n  Paperclip, Upload, UserPlus, ArrowRightLeft, Camera,\n"""
if text.count(old_icons) != 1:
    raise SystemExit('STOP: technician page icon anchor mismatch')
text = text.replace(old_icons, new_icons, 1)

helper_anchor = """function errorText(res: any) {\n"""
helper_insert = """function currentShift(): 'morning' | 'afternoon' | 'night' {\n  const hour = new Date().getHours();\n  if (hour >= 6 && hour < 14) return 'morning';\n  if (hour >= 14 && hour < 22) return 'afternoon';\n  return 'night';\n}\n\nfunction nextShift(shift: 'morning' | 'afternoon' | 'night'): 'morning' | 'afternoon' | 'night' {\n  return shift === 'morning' ? 'afternoon' : shift === 'afternoon' ? 'night' : 'morning';\n}\n\nfunction errorText(res: any) {\n"""
if text.count(helper_anchor) != 1:
    raise SystemExit('STOP: technician page helper anchor mismatch')
text = text.replace(helper_anchor, helper_insert, 1)

state_anchor = """  const [measurements, setMeasurements] = useState<any[]>([]);\n"""
state_insert = """  const [measurements, setMeasurements] = useState<any[]>([]);\n  const [attachments, setAttachments] = useState<any[]>([]);\n  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);\n  const [evidenceDescription, setEvidenceDescription] = useState('');\n  const [evidenceInputKey, setEvidenceInputKey] = useState(0);\n  const [assistanceTrade, setAssistanceTrade] = useState('');\n  const [assistanceReason, setAssistanceReason] = useState('');\n  const [assistanceRequests, setAssistanceRequests] = useState<any[]>([]);\n  const initialShift = currentShift();\n  const [handoverUsers, setHandoverUsers] = useState<any[]>([]);\n  const [handoverReceiverId, setHandoverReceiverId] = useState('');\n  const [handoverReason, setHandoverReason] = useState('Shift change');\n  const [handoverNotes, setHandoverNotes] = useState('');\n  const [handoverFromShift, setHandoverFromShift] = useState<'morning' | 'afternoon' | 'night'>(initialShift);\n  const [handoverToShift, setHandoverToShift] = useState<'morning' | 'afternoon' | 'night'>(nextShift(initialShift));\n"""
if text.count(state_anchor) != 1:
    raise SystemExit('STOP: technician page state anchor mismatch')
text = text.replace(state_anchor, state_insert, 1)

load_old = """    const [woRes, capRes, taskRes, measurementRes] = await Promise.all([\n      api.get(`/api/work-orders/${id}`),\n      api.get(`/api/work-orders/${id}/capabilities`),\n      api.get(`/api/work-orders/${id}/tasks`),\n      api.get(`/api/work-orders/${id}/measurements`),\n    ]);\n"""
load_new = """    const [woRes, capRes, taskRes, measurementRes, attachmentRes, assistanceRes] = await Promise.all([\n      api.get(`/api/work-orders/${id}`),\n      api.get(`/api/work-orders/${id}/capabilities`),\n      api.get(`/api/work-orders/${id}/tasks`),\n      api.get(`/api/work-orders/${id}/measurements`),\n      api.get(`/api/work-orders/${id}/attachments`),\n      api.get(`/api/work-orders/${id}/team-member-requests`),\n    ]);\n"""
if text.count(load_old) != 1:
    raise SystemExit('STOP: technician page load Promise anchor mismatch')
text = text.replace(load_old, load_new, 1)

load_state_old = """    if (measurementRes.success && Array.isArray(measurementRes.data)) setMeasurements(measurementRes.data);\n    setLoading(false);\n"""
load_state_new = """    if (measurementRes.success && Array.isArray(measurementRes.data)) setMeasurements(measurementRes.data);\n    if (attachmentRes.success && Array.isArray(attachmentRes.data)) setAttachments(attachmentRes.data);\n    if (assistanceRes.success && Array.isArray(assistanceRes.data)) setAssistanceRequests(assistanceRes.data);\n    setLoading(false);\n"""
if text.count(load_state_old) != 1:
    raise SystemExit('STOP: technician page load state anchor mismatch')
text = text.replace(load_state_old, load_state_new, 1)

effect_anchor = """  useEffect(() => { load(); }, [load]);\n\n"""
effect_insert = """  useEffect(() => { load(); }, [load]);\n\n  useEffect(() => {\n    if (!caps?.canHandover) { setHandoverUsers([]); return; }\n    let active = true;\n    api.get<any[]>('/api/users?role=maintenance_technician&status=active').then((res) => {\n      if (!active || !res.success || !Array.isArray(res.data)) return;\n      const options = res.data.filter((candidate: any) => {\n        if (candidate.id === user?.id) return false;\n        if (!wo?.plantId) return true;\n        return Array.isArray(candidate.plants) && candidate.plants.some((plant: any) => plant.id === wo.plantId);\n      });\n      setHandoverUsers(options);\n    });\n    return () => { active = false; };\n  }, [caps?.canHandover, user?.id, wo?.plantId]);\n\n"""
if text.count(effect_anchor) != 1:
    raise SystemExit('STOP: technician page handover user effect anchor mismatch')
text = text.replace(effect_anchor, effect_insert, 1)

resume_old = """  const resumeWaiting = () => id && perform('resume-waiting', () => api.post(`/api/work-orders/${id}/execution-state`, { action: 'resume', reason: 'Technician resumed execution' }), 'Work resumed');\n"""
resume_new = """  const resumeWaiting = () => id && perform(\n    'resume-waiting',\n    () => api.post(`/api/work-orders/${id}/execution-state`, { action: 'resume', reason: 'Execution state released/resumed' }),\n    caps?.resumeOpensExecutionSession\n      ? 'Work resumed — timer running'\n      : 'Work order released to In Progress — assigned technician must start execution',\n  );\n"""
if text.count(resume_old) != 1:
    raise SystemExit('STOP: technician page resume function anchor mismatch')
text = text.replace(resume_old, resume_new, 1)

func_anchor = """  const submitCompletion = () => {\n"""
func_insert = r'''  const uploadEvidence = async () => {
    if (!id || !evidenceFile) { toast.error('Choose a photo or file first'); return; }
    const form = new FormData();
    form.append('file', evidenceFile);
    form.append('category', 'technician_evidence');
    if (evidenceDescription.trim()) form.append('description', evidenceDescription.trim());
    const ok = await perform('evidence', () => api.post(`/api/work-orders/${id}/attachments`, form), 'Evidence uploaded');
    if (ok) {
      setEvidenceFile(null);
      setEvidenceDescription('');
      setEvidenceInputKey((value) => value + 1);
    }
  };

  const openAttachment = async (attachmentId: string) => {
    if (!id) return;
    setBusy(`open-${attachmentId}`);
    try {
      const res = await api.getRaw(`/api/work-orders/${id}/attachments/${attachmentId}`);
      if (!res.ok) { toast.error('Unable to open evidence file'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } finally {
      setBusy(null);
    }
  };

  const requestAssistance = async () => {
    if (!id || assistanceTrade.trim().length < 2) { toast.error('Enter the trade or skill required'); return; }
    if (assistanceReason.trim().length < 3) { toast.error('Explain why assistance is needed'); return; }
    const ok = await perform('assistance', () => api.post(`/api/work-orders/${id}/team-member-requests`, {
      requestedTrade: assistanceTrade.trim(),
      role: 'assistant',
      reason: assistanceReason.trim(),
    }), 'Assistance request sent to planner');
    if (ok) { setAssistanceTrade(''); setAssistanceReason(''); }
  };

  const submitHandover = async () => {
    if (!id || !handoverReceiverId) { toast.error('Select the incoming technician'); return; }
    if (handoverReason.trim().length < 3) { toast.error('Enter a handover reason'); return; }
    const pendingTasks = tasks.filter((task) => task.status !== 'completed').map((task) => ({ task: task.description, status: task.status }));
    const ok = await perform('handover', () => api.post(`/api/work-orders/${id}/handover`, {
      receivedById: handoverReceiverId,
      reason: handoverReason.trim(),
      shiftType: handoverFromShift,
      shiftDate: new Date().toISOString(),
      fromShift: handoverFromShift,
      toShift: handoverToShift,
      tasksSummary: pendingTasks,
      pendingIssues: handoverNotes.trim() || undefined,
      safetyNotes: wo?.safetyNotes || undefined,
      notes: handoverNotes.trim() || handoverReason.trim(),
      idempotencyKey: `handover-${id}-${user?.id || 'user'}-${Date.now()}`,
    }), 'Shift handover submitted and live work timers stopped');
    if (ok) { setHandoverReceiverId(''); setHandoverNotes(''); }
  };

  const submitCompletion = () => {
'''
if text.count(func_anchor) != 1:
    raise SystemExit('STOP: technician page function insertion anchor mismatch')
text = text.replace(func_anchor, func_insert, 1)

resume_button_old = """            {caps?.canResume && inWaitingState && <Button onClick={resumeWaiting} disabled={busy !== null}><RotateCcw className=\"h-4 w-4 mr-1\" />Resume Work</Button>}\n"""
resume_button_new = """            {caps?.canResume && inWaitingState && <Button onClick={resumeWaiting} disabled={busy !== null}><RotateCcw className=\"h-4 w-4 mr-1\" />{caps.resumeOpensExecutionSession ? 'Resume Work' : 'Release to In Progress'}</Button>}\n"""
if text.count(resume_button_old) != 1:
    raise SystemExit('STOP: technician page resume button anchor mismatch')
text = text.replace(resume_button_old, resume_button_new, 1)

job_grid_old = """              <div className=\"grid sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm\">\n                <div><p className=\"text-xs text-muted-foreground\">Asset / Machine</p><p className=\"font-medium\">{wo.assetName || wo.maintenanceRequest?.asset?.name || '-'}</p></div>\n                <div><p className=\"text-xs text-muted-foreground\">Type</p><p className=\"font-medium\">{pretty(wo.type)}</p></div>\n"""
job_grid_new = """              <div className=\"grid sm:grid-cols-2 lg:grid-cols-5 gap-3 text-sm\">\n                <div><p className=\"text-xs text-muted-foreground\">Asset / Machine</p><p className=\"font-medium\">{wo.assetName || wo.maintenanceRequest?.asset?.name || '-'}</p></div>\n                <div><p className=\"text-xs text-muted-foreground\">Location</p><p className=\"font-medium\">{wo.maintenanceRequest?.location || '-'}</p></div>\n                <div><p className=\"text-xs text-muted-foreground\">Type</p><p className=\"font-medium\">{pretty(wo.type)}</p></div>\n"""
if text.count(job_grid_old) != 1:
    raise SystemExit('STOP: technician page work-order grid anchor mismatch')
text = text.replace(job_grid_old, job_grid_new, 1)

# Insert Evidence card at the bottom of the main (left) workspace column.
work_notes_marker = 'Work Notes & Communication'
marker_pos = text.find(work_notes_marker)
if marker_pos < 0:
    raise SystemExit('STOP: work notes marker not found')
left_column_end = text.find('        </div>\n\n        <div className="space-y-5">', marker_pos)
if left_column_end < 0:
    raise SystemExit('STOP: left workspace column end not found')
evidence_card = r'''

          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Camera className="h-4 w-4" />Photos & Evidence <Badge variant="outline">{attachments.length}</Badge></CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2">
                <Input key={evidenceInputKey} type="file" accept="image/*,application/pdf,text/plain,text/csv" onChange={(e) => setEvidenceFile(e.target.files?.[0] || null)} />
                <Input value={evidenceDescription} onChange={(e) => setEvidenceDescription(e.target.value)} placeholder="Evidence description (optional)" />
                <Button variant="outline" className="w-fit" onClick={uploadEvidence} disabled={busy !== null || !evidenceFile}><Upload className="h-4 w-4 mr-1" />Upload Evidence</Button>
              </div>
              {attachments.length === 0 ? <p className="text-xs text-muted-foreground">No photos or evidence have been attached yet.</p> : (
                <div className="space-y-2">
                  {attachments.slice(0, 10).map((attachment: any) => (
                    <button key={attachment.id} onClick={() => openAttachment(attachment.id)} className="w-full rounded-lg border p-3 text-left hover:bg-muted/40 transition-colors" disabled={busy !== null}>
                      <div className="flex items-center justify-between gap-3"><span className="text-sm font-medium truncate"><Paperclip className="h-3.5 w-3.5 inline mr-1" />{attachment.fileName}</span><span className="text-[11px] text-muted-foreground shrink-0">{attachment.fileSize ? `${(attachment.fileSize / 1024 / 1024).toFixed(1)} MB` : ''}</span></div>
                      <p className="text-xs text-muted-foreground mt-1">{attachment.uploadedBy?.fullName || 'User'} · {formatDate(attachment.uploadedAt)}</p>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>'''
text = text[:left_column_end] + evidence_card + '\n' + text[left_column_end:]

team_button = """              <Button variant=\"outline\" className=\"w-full justify-between\" onClick={() => navigate('maintenance-work-orders', { id })}>Team / Assistance <Users className=\"h-4 w-4\" /></Button>\n"""
team_panel = r'''              <Separator />
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium"><UserPlus className="h-4 w-4" />Team / Assistance</div>
                {caps?.canRequestAssistance && (
                  <>
                    <Input value={assistanceTrade} onChange={(e) => setAssistanceTrade(e.target.value)} placeholder="Required trade / skill e.g. Electrician" />
                    <Textarea value={assistanceReason} onChange={(e) => setAssistanceReason(e.target.value)} placeholder="Why is assistance required?" rows={2} />
                    <Button variant="outline" className="w-full" onClick={requestAssistance} disabled={busy !== null || assistanceTrade.trim().length < 2 || assistanceReason.trim().length < 3}>Request Assistance</Button>
                  </>
                )}
                {assistanceRequests.slice(0, 5).map((request: any) => (
                  <div key={request.id} className="rounded-lg bg-muted/40 p-2 text-xs flex items-center justify-between gap-2"><span>{request.requestedTrade || request.requestedUser?.fullName || 'Assistance'}</span><Badge variant="outline">{pretty(request.status)}</Badge></div>
                ))}
              </div>
'''
if text.count(team_button) != 1:
    raise SystemExit('STOP: technician page team/assistance anchor mismatch')
text = text.replace(team_button, team_panel, 1)

completion_marker = """          {caps?.canSubmitCompletion && (\n"""
handover_card = r'''          {caps?.canHandover && (
            <Card className="border-blue-200 bg-blue-50/30 dark:bg-blue-950/10">
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><ArrowRightLeft className="h-4 w-4" />Shift Handover</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">Hand over live work to the incoming technician. This closes active team timers and moves the work order to Pending Handover.</p>
                <div><Label>Incoming Technician *</Label><select className="mt-1 w-full h-10 rounded-md border bg-background px-3 text-sm" value={handoverReceiverId} onChange={(e) => setHandoverReceiverId(e.target.value)}><option value="">Select technician...</option>{handoverUsers.map((candidate: any) => <option key={candidate.id} value={candidate.id}>{candidate.fullName} ({candidate.username})</option>)}</select></div>
                <div className="grid grid-cols-2 gap-2"><div><Label>From Shift</Label><select className="mt-1 w-full h-10 rounded-md border bg-background px-3 text-sm" value={handoverFromShift} onChange={(e) => setHandoverFromShift(e.target.value as 'morning' | 'afternoon' | 'night')}><option value="morning">Morning 06:00–14:00</option><option value="afternoon">Afternoon 14:00–22:00</option><option value="night">Night 22:00–06:00</option></select></div><div><Label>To Shift</Label><select className="mt-1 w-full h-10 rounded-md border bg-background px-3 text-sm" value={handoverToShift} onChange={(e) => setHandoverToShift(e.target.value as 'morning' | 'afternoon' | 'night')}><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="night">Night</option></select></div></div>
                <Input value={handoverReason} onChange={(e) => setHandoverReason(e.target.value)} placeholder="Handover reason" />
                <Textarea value={handoverNotes} onChange={(e) => setHandoverNotes(e.target.value)} placeholder="Pending issues, equipment condition, safety information..." rows={3} />
                <Button variant="outline" className="w-full" onClick={submitHandover} disabled={busy !== null || !handoverReceiverId || handoverReason.trim().length < 3}>Submit Shift Handover</Button>
              </CardContent>
            </Card>
          )}

'''
if text.count(completion_marker) != 1:
    raise SystemExit('STOP: technician page completion marker mismatch')
text = text.replace(completion_marker, handover_card + completion_marker, 1)

page.write_text(text)

# ---------------------------------------------------------------------------
# 5. Strengthen the static regression contract for the UX gaps caught in review.
# ---------------------------------------------------------------------------
test = Path('src/__tests__/work-orders/technician-workflow-contract.test.ts')
t = test.read_text()
anchor = """    expect(page).toContain('actionDescription: actionDescription.trim()');\n"""
insert = """    expect(page).toContain('actionDescription: actionDescription.trim()');\n"
insert += "    expect(page).toContain('/attachments');\n"
insert += "    expect(page).toContain('/team-member-requests');\n"
insert += "    expect(page).toContain('/handover');\n"
insert += "    expect(page).toContain('Photos & Evidence');\n"
insert += "    expect(page).toContain('Shift Handover');\n"
insert += "    expect(page).toContain('maintenanceRequest?.location');\n"
if t.count(anchor) != 1:
    raise SystemExit('STOP: workflow contract page assertions anchor mismatch')
t = t.replace(anchor, insert, 1)
anchor2 = """    expect(capability).toContain('canDeclineAssignment');\n"""
insert2 = """    expect(capability).toContain('canDeclineAssignment');\n    expect(capability).toContain('isAccountableAssignmentResponder');\n"""
if t.count(anchor2) != 1:
    raise SystemExit('STOP: workflow contract capability assertion anchor mismatch')
t = t.replace(anchor2, insert2, 1)
test.write_text(t)
PY

git diff --check

echo "[2/5] Generate Prisma client"
bunx prisma generate

echo "[3/5] Focused technician workflow tests"
bun test src/__tests__/work-orders/technician-workflow-contract.test.ts \
  src/components/modules/__tests__/create-maintenance-request-ux.test.ts

echo "[4/5] Repairs TypeScript + production build"
bunx tsc -p tsconfig.repairs.json --noEmit
bun run build

echo "[5/5] Commit and fast-forward push"
git status --short
git add \
  src/app/api/work-orders/[id]/capabilities/route.ts \
  src/app/api/work-orders/[id]/route.ts \
  src/app/api/work-orders/[id]/attachments/route.ts \
  src/app/api/work-orders/[id]/attachments/[attachmentId]/route.ts \
  src/components/modules/TechnicianWorkOrderPage.tsx \
  src/__tests__/work-orders/technician-workflow-contract.test.ts

git commit -m "Close technician workspace UX gaps"
NEW_SHA="$(git rev-parse HEAD)"
git push origin HEAD:"$FEATURE_BRANCH"

printf '%s\n' \
  "============================================================" \
  " iAssetsPro TECHNICIAN WORKFLOW V1 CORRECTED AND PUSHED" \
  "============================================================" \
  "$NEW_SHA"

df -h /
