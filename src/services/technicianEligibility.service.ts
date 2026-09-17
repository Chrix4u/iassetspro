/**
 * Technician Eligibility Service
 *
 * Checks whether a technician is eligible to be assigned or work on a given WO.
 * Uses existing User, UserSkill, UserPlant, WorkOrder and WorkOrderTimeLog fields — no new HR structures.
 */

import { db } from '@/lib/db'

export interface EligibilityResult {
  eligible: boolean
  blockers: Array<{ code: string; message: string; category: string }>
  warnings: Array<{ code: string; message: string; category: string }>
}

type TechnicianSkill = {
  tradeId: string
  proficiencyLevel: string
  certified: boolean
  yearsExperience: number | null
  trade: { id: string; name: string; code: string; category: string | null }
}

const GENERIC_TRADE_ROLE_TOKENS = new Set([
  'technician',
  'tech',
  'fitter',
  'artisan',
  'operator',
  'engineer',
  'engineering',
  'specialist',
])

function normalizeTrade(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tradeTokens(value: string): string[] {
  return normalizeTrade(value)
    .split(' ')
    .filter(Boolean)
    .filter((token) => !GENERIC_TRADE_ROLE_TOKENS.has(token))
}

/**
 * Compare trade labels semantically enough for the data already used by RWOP.
 *
 * Examples that should match:
 * - "Mechanical Fitter" <-> "mechanical"
 * - "Electrical Technician" <-> "electrical"
 * - "Instrumentation & Control" <-> "instrumentation control"
 *
 * We deliberately do not use loose substring matching, so unrelated labels such
 * as "mechanical" and "electromechanical" are not treated as equivalent.
 */
export function tradeValuesCompatible(left: string | null | undefined, right: string | null | undefined): boolean {
  if (!left || !right) return false

  const normalizedLeft = normalizeTrade(left)
  const normalizedRight = normalizeTrade(right)
  if (!normalizedLeft || !normalizedRight) return false
  if (normalizedLeft === normalizedRight) return true

  const leftTokens = tradeTokens(normalizedLeft)
  const rightTokens = tradeTokens(normalizedRight)
  if (leftTokens.length === 0 || rightTokens.length === 0) return false

  const leftSet = new Set(leftTokens)
  const rightSet = new Set(rightTokens)
  const leftWithinRight = leftTokens.every((token) => rightSet.has(token))
  const rightWithinLeft = rightTokens.every((token) => leftSet.has(token))

  return leftWithinRight || rightWithinLeft
}

function skillMatchesTradeActivity(skill: TechnicianSkill, tradeActivity: string): boolean {
  return [skill.trade.name, skill.trade.code, skill.trade.category]
    .some((candidate) => tradeValuesCompatible(candidate, tradeActivity))
}

/**
 * Check technician eligibility for a work order.
 *
 * Checks:
 * - BLOCKER: User status is not 'active' → INACTIVE_USER
 * - BLOCKER: User has no plant access for WO's plant → NO_PLANT_ACCESS
 * - WARNING: Recorded trade information is incompatible with WO tradeActivity → TRADE_MISMATCH
 * - WARNING: User has another genuinely live execution session → CONFLICTING_WORK
 * - WARNING: User has neither a primary trade nor structured UserSkill records → NO_SKILL_RECORD
 * - WARNING: Matching UserSkill exists but is not certified → NO_CERTIFICATION
 */
export async function checkTechnicianEligibility(
  userId: string,
  workOrderId: string,
): Promise<EligibilityResult> {
  const blockers: EligibilityResult['blockers'] = []
  const warnings: EligibilityResult['warnings'] = []

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      status: true,
      primaryTrade: true,
      plantAccess: { select: { plantId: true } },
      userSkills: {
        select: {
          tradeId: true,
          proficiencyLevel: true,
          certified: true,
          yearsExperience: true,
          trade: { select: { id: true, name: true, code: true, category: true } },
        },
      },
    },
  })

  if (!user) {
    return {
      eligible: false,
      blockers: [{ code: 'USER_NOT_FOUND', message: `User ${userId} not found`, category: 'user' }],
      warnings: [],
    }
  }

  const wo = await db.workOrder.findUnique({
    where: { id: workOrderId },
    select: {
      id: true,
      plantId: true,
      tradeActivity: true,
      departmentId: true,
    },
  })

  if (!wo) {
    return {
      eligible: false,
      blockers: [{ code: 'WO_NOT_FOUND', message: `Work order ${workOrderId} not found`, category: 'task' }],
      warnings: [],
    }
  }

  if (user.status && user.status !== 'active') {
    blockers.push({
      code: 'INACTIVE_USER',
      message: `User status is "${user.status}" — only active users can be assigned to work orders`,
      category: 'user',
    })
  }

  if (wo.plantId) {
    const hasPlantAccess = user.plantAccess.some((pa) => pa.plantId === wo.plantId)
    if (!hasPlantAccess) {
      blockers.push({
        code: 'NO_PLANT_ACCESS',
        message: `User does not have access to plant ${wo.plantId} where this work order is located`,
        category: 'plant',
      })
    }
  }

  if (user.primaryTrade && wo.tradeActivity) {
    const primaryTradeMatches = tradeValuesCompatible(user.primaryTrade, wo.tradeActivity)
    const structuredTradeMatches = user.userSkills.some((skill) => skillMatchesTradeActivity(skill, wo.tradeActivity!))

    if (!primaryTradeMatches && !structuredTradeMatches) {
      warnings.push({
        code: 'TRADE_MISMATCH',
        message: `User's primary trade ("${user.primaryTrade}") does not match WO trade activity ("${wo.tradeActivity}")`,
        category: 'skill',
      })
    }
  }

  // Only a genuinely live execution session can conflict with starting another
  // work order. Merely being assigned to WOs that are waiting/on hold must not
  // create a false readiness warning. This mirrors the authoritative start
  // execution service's live-session predicate.
  const conflictingSessions = await db.workOrderTimeLog.count({
    where: {
      userId,
      workOrderId: { not: workOrderId },
      action: { in: ['start', 'resume'] },
      endTime: null,
      workOrder: { status: 'in_progress' },
    },
  })

  if (conflictingSessions > 0) {
    warnings.push({
      code: 'CONFLICTING_WORK',
      message: `User has ${conflictingSessions} active execution session(s) on another work order that may conflict with this assignment`,
      category: 'schedule',
    })
  }

  checkNoSkillRecord(user.primaryTrade, user.userSkills, warnings)
  checkNoCertification(user, wo.tradeActivity, warnings)

  return {
    eligible: blockers.length === 0,
    blockers,
    warnings,
  }
}

/**
 * NO_SKILL_RECORD — WARNING
 *
 * A populated primaryTrade is already meaningful trade-profile evidence. Warn
 * only when both the primary trade and the structured skill records are absent;
 * do not incorrectly describe a technician with "Mechanical Fitter" recorded
 * as having no trade information at all.
 */
function checkNoSkillRecord(
  primaryTrade: string | null,
  userSkills: Array<{ tradeId: string }>,
  warnings: EligibilityResult['warnings'],
): void {
  if (!primaryTrade?.trim() && userSkills.length === 0) {
    warnings.push({
      code: 'NO_SKILL_RECORD',
      message: 'No primary trade or structured skill records are on file for this technician',
      category: 'skill',
    })
  }
}

/**
 * NO_CERTIFICATION — WARNING
 *
 * Certification warnings are evidence-based: they are emitted only when a
 * structured UserSkill matching the WO trade exists and that matching skill is
 * explicitly not certified. Absence of UserSkill rows alone is not evidence of
 * a failed certification requirement.
 */
function checkNoCertification(
  user: {
    primaryTrade: string | null
    userSkills: TechnicianSkill[]
  },
  tradeActivity: string | null,
  warnings: EligibilityResult['warnings'],
): void {
  if (!tradeActivity) return

  const matchingSkills = user.userSkills.filter((skill) => skillMatchesTradeActivity(skill, tradeActivity))
  const primaryTradeMatches = tradeValuesCompatible(user.primaryTrade, tradeActivity)

  if (matchingSkills.length === 0 && !primaryTradeMatches) return

  if (matchingSkills.length > 0) {
    const anyCertified = matchingSkills.some((skill) => skill.certified)
    if (!anyCertified) {
      const tradeNames = matchingSkills
        .map((skill) => skill.trade.name)
        .join(', ')
      warnings.push({
        code: 'NO_CERTIFICATION',
        message: `Technician has skill(s) for "${tradeNames}" but is not certified for this trade — certification verification recommended`,
        category: 'skill',
      })
    }
  }
}
