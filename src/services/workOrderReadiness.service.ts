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

export async function checkReadiness(
  workOrderId: string,
  checkType: ReadinessCheckType,
  tx?: Prisma.TransactionClient,
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

  const blockers: ReadinessItem[] = []
  const warnings: ReadinessItem[] = []

  switch (checkType) {
    case 'start':
      await checkStartReadiness(wo, blockers, warnings)
      break
    case 'complete':
      checkCompletionReadiness(wo, blockers, warnings)
      break
    case 'verify':
      checkVerificationReadiness(wo, blockers, warnings)
      break
    case 'close':
      checkClosureReadiness(wo, blockers, warnings)
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
  blockers: ReadinessItem[],
  warnings: ReadinessItem[],
): void {
  const activeTimers = wo.timeLogs.filter((tl) => (tl.action === 'start' || tl.action === 'resume') && !tl.endTime)
  if (activeTimers.length > 0) blockers.push({ code: 'ACTIVE_TIMERS', category: 'timer', message: `${activeTimers.length} active time timer(s) must be stopped before completion`, severity: 'blocker' })

  const ongoingDowntime = wo.workOrderDowntimes.filter((row) => !row.downtimeEnd)
  if (ongoingDowntime.length > 0) blockers.push({ code: 'ONGOING_DOWNTIME', category: 'timer', message: `${ongoingDowntime.length} ongoing downtime record(s) must be ended before completion`, severity: 'blocker' })

  const toolsOut = wo.repairToolRequests
    .filter((tr) => tr.status === 'issued' || tr.status === 'pending_return')
    .flatMap((tr) => tr.items)
    .filter(hasOpenToolCustody)
  if (toolsOut.length > 0) blockers.push({ code: 'TOOLS_ISSUED', category: 'tool', message: `${toolsOut.length} issued tool item(s) still in custody or awaiting confirmed return`, severity: 'blocker' })

  checkUnreconciledMaterials(wo, blockers, 'UNRECONCILED_MATERIALS')

  const existingMemberIds = new Set(wo.teamMembers.map((m) => m.userId))
  const pendingAssistance = wo.teamMemberRequests.filter((req) => {
    if (req.status !== 'pending' && req.status !== 'approved') return false
    if (!req.requestedUserId) return false
    return !existingMemberIds.has(req.requestedUserId)
  })
  if (pendingAssistance.length > 0) blockers.push({ code: 'PENDING_ASSISTANCE', category: 'team', message: `${pendingAssistance.length} team member request(s) pending — requested user(s) not yet added`, severity: 'blocker' })

  checkUnresolvedHandover(wo, blockers)
  checkRequiredFailureCoding(wo, warnings)
}

function checkUnresolvedHandover(wo: WoReadinessData, blockers: ReadinessItem[]): void {
  const pendingHandovers = wo.shiftHandovers.filter((sh) => sh.status === 'pending')
  if (pendingHandovers.length > 0) blockers.push({ code: 'UNRESOLVED_HANDOVER', category: 'safety', message: `${pendingHandovers.length} shift handover(s) still pending — all handovers must be confirmed before completion`, severity: 'blocker' })
}

function checkRequiredFailureCoding(wo: WoReadinessData, warnings: ReadinessItem[]): void {
  if (wo.type !== 'corrective' && wo.type !== 'predictive') return
  if (wo.failureDescription && wo.failureDescription.trim().length > 0) return
  warnings.push({ code: 'REQUIRED_FAILURE_CODING', category: 'evidence', message: `Work order type is "${wo.type}" but no failure description has been entered — failure mode, cause, and remedy should be documented`, severity: 'warning' })
}

function checkVerificationReadiness(
  wo: WoReadinessData,
  blockers: ReadinessItem[],
  warnings: ReadinessItem[],
): void {
  if (!wo.repairCompletion) blockers.push({ code: 'NO_COMPLETION_REPORT', category: 'evidence', message: 'No completion report has been submitted for this work order', severity: 'blocker' })
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
  blockers: ReadinessItem[],
  warnings: ReadinessItem[],
): void {
  if (wo.status !== 'verified') blockers.push({ code: 'NOT_VERIFIED', category: 'task', message: `Work order status is '${wo.status}', must be 'verified' before closure`, severity: 'blocker' })
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
  const toolsOut = wo.repairToolRequests
    .filter((tr) => tr.status === 'issued' || tr.status === 'pending_return')
    .flatMap((tr) => tr.items)
    .filter(hasOpenToolCustody)
  if (toolsOut.length > 0) out.push({ code: 'OPEN_TOOL_CUSTODY', category: 'tool', message: `${toolsOut.length} issued tool item(s) still in custody or awaiting confirmed return`, severity: 'blocker' })
}

function checkUnreconciledMaterials(
  wo: WoReadinessData,
  out: ReadinessItem[],
  code: string,
): void {
  const unreconciled = wo.repairMaterialRequests.filter((mr) => {
    // Any request that actually issued material must reconcile, regardless of
    // whether it is currently issued, partially returned, fully returned, or closed.
    if ((mr.quantityIssued ?? 0) <= 0) return false
    if (mr.status === 'rejected' || mr.status === 'cancelled') return false

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
      message: `${unreconciled.length} material request(s) have unaccounted issued quantity (consumed + wasted + returned ≠ issued)`,
      severity: 'blocker',
    })
  }
}

function checkMaterialReconciliation(wo: WoReadinessData, out: ReadinessItem[]): void {
  checkUnreconciledMaterials(wo, out, 'OPEN_MATERIAL_RECONCILIATION')
}
