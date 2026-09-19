import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { checkTechnicianEligibility } from '@/services/technicianEligibility.service'

export interface ReadinessCheckResult {
  ready: boolean
  blockers: ReadinessItem[]
  warnings: ReadinessItem[]
}

export interface ReadinessItem {
  code: string
  category: string
  message: string
  severity: 'blocker' | 'warning'
}

export interface WorkOrderReadinessContext {
  completionEvidence?: {
    failureDescription?: string | null
    causeDescription?: string | null
    actionDescription?: string | null
  }
}

export type ReadinessCheckType = 'start' | 'complete' | 'verify' | 'close'

type WoReadinessData = {
  id: string
  status: string
  type: string
  plantId: string | null
  assignedTo: string | null
  totalCost: number
  laborCost: number
  partsCost: number
  contractorCost: number
  safetyNotes: string | null
  failureDescription: string | null
  causeDescription: string | null
  actionDescription: string | null
  tradeActivity: string | null
  teamMembers: { userId: string }[]
  teamMemberRequests: { id: string; status: string; requestedUserId: string | null }[]
  timeLogs: { id: string; action: string; endTime: DateTime | null }[]
  workOrderDowntimes: { id: string; downtimeEnd: DateTime | null }[]
  repairToolRequests: {
    id: string
    status: string
    items: {
      id: string
      quantityIssued: number
      quantityReturned: number
      quantityTransferred: number
      pendingReturnQty: number | null
    }[]
  }[]
  repairMaterialRequests: {
    id: string
    status: string
    quantityIssued: number
    consumedQty: number | null
    wastedQty: number | null
    quantityReturned: number | null
  }[]
  repairCompletion: { id: string; reworkCount: number } | null
  shiftHandovers: { id: string; status: string }[]
  assignee?: {
    id: string
    status: string | null
    primaryTrade: string | null
    plantAccess: { id: string; plantId: string }[]
  } | null
}

type DateTime = string | Date

function requiresFailureEvidence(type: string): boolean {
  return type === 'corrective' || type === 'predictive'
}

export async function checkReadiness(
  workOrderId: string,
  checkType: ReadinessCheckType,
  tx?: Prisma.TransactionClient,
  context?: WorkOrderReadinessContext,
): Promise<ReadinessCheckResult> {
  const client = tx ?? db

  const wo = await client.workOrder.findUnique({
    where: { id: workOrderId },
    select: {
      id: true,
      status: true,
      type: true,
      plantId: true,
      assignedTo: true,
      totalCost: true,
      laborCost: true,
      partsCost: true,
      contractorCost: true,
      safetyNotes: true,
      failureDescription: true,
      causeDescription: true,
      actionDescription: true,
      tradeActivity: true,
      teamMembers: { select: { userId: true } },
      teamMemberRequests: { select: { id: true, status: true, requestedUserId: true } },
      timeLogs: { select: { id: true, action: true, endTime: true } },
      workOrderDowntimes: { select: { id: true, downtimeEnd: true } },
      repairToolRequests: {
        select: {
          id: true,
          status: true,
          items: {
            select: {
              id: true,
              quantityIssued: true,
              quantityReturned: true,
              quantityTransferred: true,
              pendingReturnQty: true,
            },
          },
        },
      },
      repairMaterialRequests: {
        select: {
          id: true,
          status: true,
          quantityIssued: true,
          consumedQty: true,
          wastedQty: true,
          quantityReturned: true,
        },
      },
      repairCompletion: { select: { id: true, reworkCount: true } },
      shiftHandovers: { select: { id: true, status: true } },
      assignee: {
        select: {
          id: true,
          status: true,
          primaryTrade: true,
          plantAccess: { select: { id: true, plantId: true } },
        },
      },
    },
  })

  if (!wo) {
    return {
      ready: false,
      blockers: [{
        code: 'WO_NOT_FOUND',
        category: 'task',
        message: `Work order ${workOrderId} not found`,
        severity: 'blocker',
      }],
      warnings: [],
    }
  }

  const evidenceAttachmentCount =
    checkType !== 'start' && requiresFailureEvidence(wo.type)
      ? await client.attachment.count({
          where: {
            entityType: 'work_order',
            entityId: workOrderId,
            OR: [
              { description: { startsWith: '[technician_evidence]' } },
              { description: { startsWith: '[completion_evidence]' } },
            ],
          },
        })
      : 0

  const effectiveWo: WoReadinessData = {
    ...wo,
    failureDescription:
      context?.completionEvidence?.failureDescription ?? wo.failureDescription,
    causeDescription:
      context?.completionEvidence?.causeDescription ?? wo.causeDescription,
    actionDescription:
      context?.completionEvidence?.actionDescription ?? wo.actionDescription,
  }

  const blockers: ReadinessItem[] = []
  const warnings: ReadinessItem[] = []

  switch (checkType) {
    case 'start':
      await checkStartReadiness(effectiveWo, blockers, warnings)
      break
    case 'complete':
      checkCompletionReadiness(effectiveWo, evidenceAttachmentCount, blockers, warnings)
      break
    case 'verify':
      checkVerificationReadiness(effectiveWo, evidenceAttachmentCount, blockers, warnings)
      break
    case 'close':
      checkClosureReadiness(effectiveWo, evidenceAttachmentCount, blockers, warnings)
      break
  }

  return { ready: blockers.length === 0, blockers, warnings }
}

async function checkStartReadiness(
  wo: WoReadinessData,
  blockers: ReadinessItem[],
  warnings: ReadinessItem[],
): Promise<void> {
  if (!wo.assignedTo && wo.teamMembers.length === 0) {
    blockers.push({ code: 'NO_TEAM', category: 'team', message: 'Work order has no assigned technician or team members', severity: 'blocker' })
  }

  if (wo.status === 'pending_handover') {
    const confirmedHandover = wo.shiftHandovers.some((sh) => sh.status === 'confirmed')
    if (!confirmedHandover) {
      blockers.push({ code: 'MANDATORY_HANDOVER_PENDING', category: 'safety', message: 'Work order is in pending_handover status — shift handover must be confirmed before resuming', severity: 'blocker' })
    }
  }

  if (wo.assignedTo && wo.plantId) {
    const hasPlantAccess = wo.assignee?.plantAccess.some((pa) => pa.plantId === wo.plantId) ?? false
    if (!hasPlantAccess) {
      blockers.push({ code: 'NO_PLANT_ACCESS', category: 'safety', message: `Assigned technician does not have access to plant ${wo.plantId}`, severity: 'blocker' })
    }
  }

  checkRequiredPermit(wo, warnings)
  await checkTechnicianEligibilityForStart(wo, blockers, warnings)
}

function checkRequiredPermit(wo: WoReadinessData, warnings: ReadinessItem[]): void {
  if (!wo.safetyNotes) return
  const notesLower = wo.safetyNotes.toLowerCase()
  if (notesLower.includes('permit') || notesLower.includes('loto')) {
    warnings.push({ code: 'REQUIRED_PERMIT_CHECK', category: 'safety', message: 'Work order safety notes mention permit/LOTO requirements — verify that all required permits are obtained before starting work', severity: 'warning' })
  }
}

async function checkTechnicianEligibilityForStart(
  wo: WoReadinessData,
  blockers: ReadinessItem[],
  warnings: ReadinessItem[],
): Promise<void> {
  if (!wo.assignedTo) return
  try {
    const result = await checkTechnicianEligibility(wo.assignedTo, wo.id)
    for (const b of result.blockers) blockers.push({ code: `TECH_ELIG_${b.code}`, category: b.category, message: b.message, severity: 'blocker' })
    for (const w of result.warnings) warnings.push({ code: `TECH_ELIG_${w.code}`, category: w.category, message: w.message, severity: 'warning' })
  } catch {
    warnings.push({ code: 'TECH_ELIG_CHECK_FAILED', category: 'task', message: 'Technician eligibility check could not be completed — proceed with caution', severity: 'warning' })
  }
}

function hasOpenToolCustody(item: WoReadinessData['repairToolRequests'][number]['items'][number]): boolean {
  // Current custody is authoritative from issued/returned/transferred quantities.
  // pendingReturnQty is retained as a compatibility safety net for legacy/imported
  // records that predate the complete quantity-ledger fields. Never allow an old
  // record with a known pending return to bypass completion readiness.
  const issued = Number.isFinite(item.quantityIssued) ? item.quantityIssued : 0
  const returned = Number.isFinite(item.quantityReturned) ? item.quantityReturned : 0
  const transferred = Number.isFinite(item.quantityTransferred) ? item.quantityTransferred : 0
  const outstanding = Math.max(0, issued - returned - transferred)
  return outstanding > 0 || (item.pendingReturnQty ?? 0) > 0
}

function checkCompletionReadiness(
  wo: WoReadinessData,
  evidenceAttachmentCount: number,
  blockers: ReadinessItem[],
  warnings: ReadinessItem[],
): void {
  const activeTimers = wo.timeLogs.filter((tl) => (tl.action === 'start' || tl.action === 'resume') && !tl.endTime)
  if (activeTimers.length > 0) blockers.push({ code: 'ACTIVE_TIMERS', category: 'timer', message: `${activeTimers.length} active time timer(s) must be stopped before completion`, severity: 'blocker' })

  const ongoingDowntime = wo.workOrderDowntimes.filter((row) => !row.downtimeEnd)
  if (ongoingDowntime.length > 0) blockers.push({ code: 'ONGOING_DOWNTIME', category: 'timer', message: `${ongoingDowntime.length} ongoing downtime record(s) must be ended before completion`, severity: 'blocker' })

  const unresolvedToolRequests = wo.repairToolRequests.filter((tr) =>
    ['pending', 'supervisor_approved', 'storekeeper_approved'].includes(tr.status),
  )
  if (unresolvedToolRequests.length > 0) {
    blockers.push({
      code: 'PENDING_TOOL_REQUESTS',
      category: 'tool',
      message: `${unresolvedToolRequests.length} tool request(s) are still awaiting approval or issuance — resolve, reject, or cancel them before completion`,
      severity: 'blocker',
    })
  }

  const activeToolRequests = wo.repairToolRequests.filter((tr) => tr.status === 'issued' || tr.status === 'pending_return')
  const toolsOut = activeToolRequests.flatMap((tr) => tr.items).filter(hasOpenToolCustody)
  const legacyToolsOut = activeToolRequests.filter((tr) => tr.items.length === 0)
  const openToolCount = toolsOut.length + legacyToolsOut.length
  if (openToolCount > 0) blockers.push({ code: 'TOOLS_ISSUED', category: 'tool', message: `${openToolCount} issued tool item(s) still in custody or awaiting confirmed return`, severity: 'blocker' })

  const unresolvedMaterialRequests = wo.repairMaterialRequests.filter((mr) =>
    ['pending', 'supervisor_approved', 'storekeeper_approved'].includes(mr.status),
  )
  if (unresolvedMaterialRequests.length > 0) {
    blockers.push({
      code: 'PENDING_MATERIAL_REQUESTS',
      category: 'material',
      message: `${unresolvedMaterialRequests.length} material request(s) are still awaiting approval or issuance — resolve, reject, or cancel them before completion`,
      severity: 'blocker',
    })
  }

  checkUnreconciledMaterials(wo, blockers, 'UNRECONCILED_MATERIALS')

  const existingMemberIds = new Set(wo.teamMembers.map((m) => m.userId))
  const unresolvedAssistance = wo.teamMemberRequests.filter((req) => {
    if (req.status === 'pending') return true
    if (req.status !== 'approved') return false
    if (!req.requestedUserId) return true
    return !existingMemberIds.has(req.requestedUserId)
  })
  if (unresolvedAssistance.length > 0) {
    blockers.push({
      code: 'PENDING_ASSISTANCE',
      category: 'team',
      message: `${unresolvedAssistance.length} assistance request(s) are still awaiting review or assignment — resolve, reject, or cancel them before completion`,
      severity: 'blocker',
    })
  }

  checkUnresolvedHandover(wo, blockers)
  checkRequiredRepairEvidence(wo, evidenceAttachmentCount, blockers)
}

function checkUnresolvedHandover(wo: WoReadinessData, blockers: ReadinessItem[]): void {
  const pendingHandovers = wo.shiftHandovers.filter((sh) => sh.status === 'pending')
  if (pendingHandovers.length > 0) blockers.push({ code: 'UNRESOLVED_HANDOVER', category: 'safety', message: `${pendingHandovers.length} shift handover(s) still pending — all handovers must be confirmed before completion`, severity: 'blocker' })
}

function checkRequiredRepairEvidence(
  wo: WoReadinessData,
  evidenceAttachmentCount: number,
  blockers: ReadinessItem[],
): void {
  if (!requiresFailureEvidence(wo.type)) return

  const missing: string[] = []
  if (!wo.failureDescription?.trim()) missing.push('failure description')
  if (!wo.causeDescription?.trim()) missing.push('root cause')
  if (!wo.actionDescription?.trim()) missing.push('corrective action')

  if (missing.length > 0) {
    blockers.push({
      code: 'RCA_REQUIRED',
      category: 'evidence',
      message: `${wo.type} work orders require complete RCA before progression — missing ${missing.join(', ')}`,
      severity: 'blocker',
    })
  }

  if (evidenceAttachmentCount < 1) {
    blockers.push({
      code: 'COMPLETION_EVIDENCE_REQUIRED',
      category: 'evidence',
      message: `${wo.type} work orders require at least one technician/completion evidence photo or document attachment`,
      severity: 'blocker',
    })
  }
}

function checkVerificationReadiness(
  wo: WoReadinessData,
  evidenceAttachmentCount: number,
  blockers: ReadinessItem[],
  warnings: ReadinessItem[],
): void {
  if (!wo.repairCompletion) blockers.push({ code: 'NO_COMPLETION_REPORT', category: 'evidence', message: 'No completion report has been submitted for this work order', severity: 'blocker' })
  checkRequiredRepairEvidence(wo, evidenceAttachmentCount, blockers)
  checkToolCustody(wo, blockers)
  checkMaterialReconciliation(wo, blockers)
  checkIncompleteCostWarning(wo, warnings)
}

function checkIncompleteCostWarning(wo: WoReadinessData, warnings: ReadinessItem[]): void {
  const hasTimeLogs = wo.timeLogs.length > 0
  const hasMaterialCosts = wo.repairMaterialRequests.some((mr) => mr.quantityIssued > 0 && ((mr.consumedQty ?? 0) > 0 || (mr.wastedQty ?? 0) > 0))
  if (!hasTimeLogs && !hasMaterialCosts) warnings.push({ code: 'INCOMPLETE_COST_WARNING', category: 'evidence', message: 'No labor hours or material costs have been recorded — cost data appears incomplete for verification', severity: 'warning' })
}

function checkClosureReadiness(
  wo: WoReadinessData,
  evidenceAttachmentCount: number,
  blockers: ReadinessItem[],
  warnings: ReadinessItem[],
): void {
  if (wo.status !== 'verified') blockers.push({ code: 'NOT_VERIFIED', category: 'task', message: `Work order status is '${wo.status}', must be 'verified' before closure`, severity: 'blocker' })
  checkRequiredRepairEvidence(wo, evidenceAttachmentCount, blockers)
  checkToolCustody(wo, blockers)
  checkMaterialReconciliation(wo, blockers)
  if (wo.totalCost === 0 && (wo.laborCost + wo.partsCost + wo.contractorCost) === 0) blockers.push({ code: 'INCOMPLETE_COST', category: 'evidence', message: 'No cost data has been recorded for this work order', severity: 'blocker' })
  if (wo.repairCompletion && wo.repairCompletion.reworkCount > 0 && wo.status !== 'verified') blockers.push({ code: 'OPEN_REWORK', category: 'quality', message: `Repair completion has ${wo.repairCompletion.reworkCount} rework(s) — work order must be re-verified before closure`, severity: 'blocker' })
  checkAuthoritativeCostUnavailable(wo, warnings)
}

function checkAuthoritativeCostUnavailable(wo: WoReadinessData, warnings: ReadinessItem[]): void {
  if (wo.totalCost > 0) return
  if (wo.timeLogs.length > 0) return
  warnings.push({ code: 'AUTHORITATIVE_COST_UNAVAILABLE', category: 'evidence', message: 'Total cost is zero and no time logs exist — authoritative cost calculation may be incomplete', severity: 'warning' })
}

function checkToolCustody(wo: WoReadinessData, out: ReadinessItem[]): void {
  const activeToolRequests = wo.repairToolRequests.filter((tr) => tr.status === 'issued' || tr.status === 'pending_return')
  const toolsOut = activeToolRequests.flatMap((tr) => tr.items).filter(hasOpenToolCustody)
  const legacyToolsOut = activeToolRequests.filter((tr) => tr.items.length === 0)
  const openToolCount = toolsOut.length + legacyToolsOut.length
  if (openToolCount > 0) out.push({ code: 'OPEN_TOOL_CUSTODY', category: 'tool', message: `${openToolCount} issued tool item(s) still in custody or awaiting confirmed return`, severity: 'blocker' })
}

function checkUnreconciledMaterials(
  wo: WoReadinessData,
  out: ReadinessItem[],
  code: string,
): void {
  const unreconciled = wo.repairMaterialRequests.filter((mr) => {
    // Any request that actually issued material must be explicitly store-reconciled
    // and closed. A technician declaration, partial return, or even a fully returned
    // quantity does not by itself cross the final inventory/accountability boundary.
    if ((mr.quantityIssued ?? 0) <= 0) return false
    if (mr.status === 'rejected' || mr.status === 'cancelled') return false
    if (mr.status !== 'closed') return true

    const consumed = mr.consumedQty ?? 0
    const wasted = mr.wastedQty ?? 0
    const returned = mr.quantityReturned ?? 0
    const total = consumed + wasted + returned
    return Math.abs(total - mr.quantityIssued) > 0.001
  })

  if (unreconciled.length > 0) {
    out.push({
      code,
      category: 'material',
      message: `${unreconciled.length} issued material request(s) still require store verification and final reconciliation before completion`,
      severity: 'blocker',
    })
  }
}

function checkMaterialReconciliation(wo: WoReadinessData, out: ReadinessItem[]): void {
  checkUnreconciledMaterials(wo, out, 'OPEN_MATERIAL_RECONCILIATION')
}
