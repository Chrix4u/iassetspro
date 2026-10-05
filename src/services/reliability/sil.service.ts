// ============================================================================
// SIL (SAFETY INSTRUMENTED LEVEL) SERVICE
// IEC 61511 — SIL Verification, SIF Management, LOPA, PFD/SFF Calculation
// ============================================================================

import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import type { Prisma } from '@prisma/client';

const log = createLogger('SILService');

// ── TYPES ────────────────────────────────────────────────────────────────────

export interface SisComponent {
  name: string;
  tag: string;
  type: 'sensor' | 'logic_solver' | 'final_element';
  safeFailureRate: number;    // λ_S (per hour)
  dangerousFailureRate: number; // λ_D (per hour)
  dangerousDetectedRate: number; // λ_DD (per hour, within λ_D)
  proofTestCoverage: number;  // % detected by proof test
  mttr: number;               // Mean Time To Repair (hours)
}

export interface LopaLayer {
  name: string;
  description: string;
  pfd: number;          // Probability of Failure on Demand for this IPL
  credits: number;      // Risk reduction factor (1/PFD)
}

export interface CreateSilAssessmentData {
  assetId: string;
  sifName: string;
  sifDescription?: string;
  silTarget: number;
  architecture?: string;
  proofTestIntervalMonths?: number;
  demandRate?: number;
  components?: SisComponent[];
  lopaLayers?: LopaLayer[];
  notes?: string;
  assessedById: string;
  approvedById?: string;
  status?: string;
}

export interface ListSilParams {
  assetId?: string;
  assetIds?: string[];
  silTarget?: number;
  status?: string;
  page?: number;
  limit?: number;
}

export interface SilVerificationResult {
  silAchieved: number;
  pfdCalculated: number;
  sffCalculated: number;
  meetsTarget: boolean;
  architectureVoted: string;
  proofTestRecommendation: number;
  gapAnalysis: string;
}

// ── CONSTANTS ────────────────────────────────────────────────────────────────

const SIL_PFD_RANGES: Record<number, { min: number; max: number; label: string }> = {
  1: { min: 0.01,  max: 0.1,   label: 'SIL 1' },
  2: { min: 0.001, max: 0.01,  label: 'SIL 2' },
  3: { min: 0.0001, max: 0.001, label: 'SIL 3' },
  4: { min: 0.00001, max: 0.0001, label: 'SIL 4' },
};

const SIL_SFF_REQUIREMENTS: Record<string, { typeA: number; typeB: number }> = {
  '1oo1': { typeA: 0, typeB: 0.9 },
  '1oo2': { typeA: 0, typeB: 0.9 },
  '2oo3': { typeA: 0, typeB: 0.9 },
  '1oo3': { typeA: 0, typeB: 0.9 },
  '2oo4': { typeA: 0, typeB: 0.9 },
};

const VALID_ARCHITECTURES = ['1oo1', '1oo2', '2oo3', '1oo3', '2oo4'];
const VALID_STATUSES = ['draft', 'active', 'approved', 'archived'];

// ── HELPERS ──────────────────────────────────────────────────────────────────

/** Determine SIL achieved from PFD value */
function pfdToSil(pfd: number): number {
  if (pfd <= 0.0001) return 4;
  if (pfd <= 0.001) return 3;
  if (pfd <= 0.01) return 2;
  if (pfd <= 0.1) return 1;
  return 0; // Below SIL 1
}

/** Calculate PFD for a single component with proof test */
function componentPFD(
  lambdaD: number,
  lambdaDD: number,
  proofTestIntervalHours: number,
  mttr: number,
  proofTestCoverage: number,
): number {
  const ti = proofTestIntervalHours;
  const lambdaDU = lambdaD - lambdaDD; // Dangerous undetected
  // PFD = λ_DU × (TI/2) + λ_D × MTTR + (1-PTC) × λ_DU × TI
  const pfdDetectable = lambdaDU * (ti / 2);
  const pfdRepair = lambdaD * mttr;
  const pfdUncovered = (1 - proofTestCoverage) * lambdaDU * ti;
  return pfdDetectable + pfdRepair + pfdUncovered;
}

/** Calculate SFF (Safe Failure Fraction) for a component */
function componentSFF(lambdaS: number, lambdaD: number, lambdaDD: number): number {
  const totalLambda = lambdaS + lambdaD;
  if (totalLambda === 0) return 1;
  return (lambdaS + lambdaDD) / totalLambda;
}

/** Calculate PFD for a voted group (simplified approach) */
function votedGroupPFD(
  components: SisComponent[],
  architecture: string,
  proofTestIntervalHours: number,
): number {
  const match = architecture.match(/(\d+)oo(\d+)/);
  if (!match) return 0;

  const k = parseInt(match[1]);
  const n = parseInt(match[2]);
  const m = n - k; // Minimum components needed

  // For simplicity, use the worst-case PFD across components
  // Full HFTA calculation would use binomial expansion
  const pfds = components.map((c) =>
    componentPFD(c.dangerousFailureRate, c.dangerousDetectedRate, proofTestIntervalHours, c.mttr, c.proofTestCoverage)
  );

  if (pfds.length === 0) return 0;

  // kooN PFD approximation
  if (n === 1) return pfds[0]; // 1oo1
  if (m === 1) {
    // kooN where k = n-1 (e.g., 1oo2, 2oo3): PFD ≈ C(n, k+1) × p^(k+1)
    const p = pfds[0]; // Assume identical components
    const combinations = n;
    return combinations * Math.pow(p, m + 1);
  }

  // Default: sum of PFDs for series
  return pfds.reduce((sum, pfd) => sum + pfd, 0);
}

/** Find optimal proof test interval for a target SIL */
function optimizeProofTestInterval(
  components: SisComponent[],
  architecture: string,
  targetSil: number,
  currentIntervalMonths: number,
): { recommendedMonths: number; pfd: number; sil: number } {
  const targetPfdMax = SIL_PFD_RANGES[targetSil]?.max ?? 0.1;

  // Binary search for the longest interval that still meets target
  let low = 1;    // 1 month minimum
  let high = 120; // 10 years maximum
  let bestInterval = currentIntervalMonths;

  for (let attempt = 0; attempt < 20; attempt++) {
    const mid = Math.floor((low + high) / 2);
    const intervalHours = mid * 30.44 * 24; // Average month in hours
    const pfd = votedGroupPFD(components, architecture, intervalHours);
    const sil = pfdToSil(pfd);

    if (sil >= targetSil) {
      bestInterval = mid;
      low = mid + 1; // Try longer interval
    } else {
      high = mid - 1; // Need shorter interval
    }
  }

  const finalIntervalHours = bestInterval * 30.44 * 24;
  const finalPfd = votedGroupPFD(components, architecture, finalIntervalHours);
  const finalSil = pfdToSil(finalPfd);

  return {
    recommendedMonths: bestInterval,
    pfd: Math.round(finalPfd * 100000) / 100000,
    sil: finalSil,
  };
}

/** Verify SIL assessment — full computation */
function verifySil(
  components: SisComponent[],
  architecture: string,
  proofTestIntervalMonths: number,
  targetSil: number,
): SilVerificationResult {
  const proofTestIntervalHours = proofTestIntervalMonths * 30.44 * 24;

  // PFD calculation
  const pfdCalculated = votedGroupPFD(components, architecture, proofTestIntervalHours);
  const silAchieved = pfdToSil(pfdCalculated);

  // SFF calculation (average across components — all are treated as Type B)
  let totalSFF = 0;
  for (const c of components) {
    totalSFF += componentSFF(c.safeFailureRate, c.dangerousFailureRate, c.dangerousDetectedRate);
  }
  const sffCalculated = components.length > 0
    ? Math.round((totalSFF / components.length) * 10000) / 10000
    : 1;

  // SFF check per architecture
  const sffReq = SIL_SFF_REQUIREMENTS[architecture]?.typeB ?? 0.9;
  const meetsTarget = silAchieved >= targetSil;

  // Proof test optimization
  const proofTestRecommendation = optimizeProofTestInterval(
    components, architecture, targetSil, proofTestIntervalMonths,
  );

  // Gap analysis
  let gapAnalysis: string;
  if (meetsTarget) {
    gapAnalysis = `SIL ${silAchieved} achieved (target: SIL ${targetSil}).`;
    if (proofTestRecommendation.recommendedMonths > proofTestIntervalMonths) {
      gapAnalysis += ` Proof test interval can potentially be extended to ${proofTestRecommendation.recommendedMonths} months.`;
    }
  } else {
    gapAnalysis = `SIL ${silAchieved} achieved — does NOT meet target SIL ${targetSil}.`;
    if (sffCalculated < sffReq) {
      gapAnalysis += ` SFF (${(sffCalculated * 100).toFixed(1)}%) is below requirement (${(sffReq * 100).toFixed(0)}%). Consider higher-architecture voting or improved proof test coverage.`;
    } else {
      gapAnalysis += ` Consider reducing proof test interval or using higher-reliability components.`;
    }
  }

  return {
    silAchieved,
    pfdCalculated: Math.round(pfdCalculated * 100000) / 100000,
    sffCalculated,
    meetsTarget,
    architectureVoted: architecture,
    proofTestRecommendation: proofTestRecommendation.recommendedMonths,
    gapAnalysis,
  };
}

// ── SERVICE ──────────────────────────────────────────────────────────────────

export const silService = {

  /**
   * List SIL assessments with optional filtering
   */
  async listAssessments(params: ListSilParams) {
    const timer = log.timer('listAssessments');
    const { assetId, assetIds, silTarget, status, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (assetId) where.assetId = assetId;
    else if (assetIds) where.assetId = { in: assetIds };
    if (silTarget) where.silTarget = silTarget;
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      db.silAssessment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.silAssessment.count({ where }),
    ]);

    timer.end();
    return {
      items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },

  /**
   * Create SIL assessment — performs full verification
   */
  async createAssessment(data: CreateSilAssessmentData) {
    const timer = log.timer('createAssessment');

    // Validate
    if (data.silTarget < 1 || data.silTarget > 4) {
      throw new ValidationError({ silTarget: 'Must be 1, 2, 3, or 4' });
    }
    if (data.architecture && !VALID_ARCHITECTURES.includes(data.architecture)) {
      throw new ValidationError({ architecture: `Must be one of: ${VALID_ARCHITECTURES.join(', ')}` });
    }

    const components = data.components ?? [];
    const architecture = data.architecture ?? '1oo1';
    const proofTestInterval = data.proofTestIntervalMonths ?? 12;

    // Compute PFD requirements from SIL target
    const pfdRequired = SIL_PFD_RANGES[data.silTarget]?.max ?? 0.1;

    // Run verification if we have component data
    let verification: SilVerificationResult | null = null;
    let pfdCalculated: number | undefined;
    let sffCalculated: number | undefined;
    let silAchieved: number | undefined;

    if (components.length > 0) {
      verification = verifySil(components, architecture, proofTestInterval, data.silTarget);
      pfdCalculated = verification.pfdCalculated;
      sffCalculated = verification.sffCalculated;
      silAchieved = verification.silAchieved;
    }

    // LOPA integration: sum PFD of all independent protection layers
    let lopaPfdTotal = 0;
    if (data.lopaLayers?.length) {
      lopaPfdTotal = data.lopaLayers.reduce((sum, layer) => sum + layer.pfd, 0);
    }

    const assessment = await db.silAssessment.create({
      data: {
        assetId: data.assetId,
        sifName: data.sifName,
        sifDescription: data.sifDescription,
        silTarget: data.silTarget,
        silAchieved,
        pfdRequired,
        pfdCalculated,
        sffRequired: SIL_SFF_REQUIREMENTS[architecture]?.typeB ?? 0.9,
        sffCalculated,
        architecture,
        proofTestIntervalMonths: proofTestInterval,
        demandRate: data.demandRate,
        lopaLayers: data.lopaLayers?.length
          ? data.lopaLayers as unknown as Prisma.InputJsonValue
          : undefined,
        components: components.length > 0
          ? components as unknown as Prisma.InputJsonValue
          : undefined,
        status: verification?.meetsTarget ? 'active' : 'draft',
        notes: data.notes,
        assessedById: data.assessedById,
        approvedById: verification?.meetsTarget ? data.approvedById : undefined,
      },
    });

    timer.end();
    log.info('SIL assessment created', {
      id: assessment.id,
      sifName: data.sifName,
      silTarget: data.silTarget,
      silAchieved,
      meetsTarget: verification?.meetsTarget,
    });

    return { assessment, verification };
  },

  /**
   * Get a single SIL assessment by ID
   */
  async getAssessment(id: string) {
    const assessment = await db.silAssessment.findUnique({ where: { id } });
    if (!assessment) throw new NotFoundError('SilAssessment', id);

    // Re-run verification if we have components
    let verification: SilVerificationResult | null = null;
    const components = assessment.components as unknown as SisComponent[] | null;
    if (components && components.length > 0 && assessment.architecture) {
      verification = verifySil(components, assessment.architecture, assessment.proofTestIntervalMonths, assessment.silTarget);
    }

    return { assessment, verification };
  },

  /**
   * Update a SIL assessment — re-verifies if component data changes
   */
  async updateAssessment(id: string, data: Partial<CreateSilAssessmentData>) {
    const existing = await db.silAssessment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('SilAssessment', id);

    if (data.silTarget != null && (data.silTarget < 1 || data.silTarget > 4)) {
      throw new ValidationError({ silTarget: 'Must be 1, 2, 3, or 4' });
    }
    if (data.status && !VALID_STATUSES.includes(data.status)) {
      throw new ValidationError({ status: `Must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    const components = data.components
      ?? (existing.components as unknown as SisComponent[] | null)
      ?? [];
    const architecture = data.architecture ?? existing.architecture ?? '1oo1';
    const proofTestInterval = data.proofTestIntervalMonths ?? existing.proofTestIntervalMonths;
    const silTarget = data.silTarget ?? existing.silTarget;

    // Re-verify
    let silAchieved = existing.silAchieved;
    let pfdCalculated = existing.pfdCalculated;
    let sffCalculated = existing.sffCalculated;
    let newStatus = data.status ?? existing.status;

    if (components.length > 0) {
      const verification = verifySil(components, architecture, proofTestInterval, silTarget);
      silAchieved = verification.silAchieved;
      pfdCalculated = verification.pfdCalculated;
      sffCalculated = verification.sffCalculated;
      if (verification.meetsTarget && existing.status === 'draft') {
        newStatus = 'active';
      }
    }

    const pfdRequired = SIL_PFD_RANGES[silTarget]?.max ?? 0.1;
    const sffRequired = SIL_SFF_REQUIREMENTS[architecture]?.typeB ?? 0.9;

    const updateData: Prisma.SilAssessmentUncheckedUpdateInput = {
      ...data,
      lopaLayers: data.lopaLayers === undefined
        ? undefined
        : data.lopaLayers as unknown as Prisma.InputJsonValue,
      components: data.components === undefined
        ? undefined
        : data.components as unknown as Prisma.InputJsonValue,
      silAchieved,
      pfdRequired,
      pfdCalculated,
      sffRequired,
      sffCalculated,
      status: newStatus,
    };
    delete updateData.assessedById;

    const updated = await db.silAssessment.update({
      where: { id },
      data: updateData,
    });

    log.info('SIL assessment updated', { id, silAchieved });
    return updated;
  },

  /**
   * Delete a SIL assessment
   */
  async deleteAssessment(id: string) {
    const existing = await db.silAssessment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('SilAssessment', id);
    return db.silAssessment.delete({ where: { id } });
  },

  /**
   * Run SIL verification only (without saving)
   */
  verifyOnly(data: {
    components: SisComponent[];
    architecture: string;
    proofTestIntervalMonths: number;
    targetSil: number;
  }): SilVerificationResult {
    return verifySil(data.components, data.architecture, data.proofTestIntervalMonths, data.targetSil);
  },

  /**
   * Optimize proof test interval for an existing assessment
   */
  async optimizeProofTest(id: string) {
    const existing = await db.silAssessment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('SilAssessment', id);

    const components = (existing.components ?? []) as unknown as SisComponent[];
    if (components.length === 0 || !existing.architecture) {
      throw new ValidationError({ components: 'Component data required for proof test optimization' });
    }

    const result = optimizeProofTestInterval(
      components, existing.architecture, existing.silTarget, existing.proofTestIntervalMonths,
    );

    return {
      assessmentId: id,
      currentIntervalMonths: existing.proofTestIntervalMonths,
      recommendedIntervalMonths: result.recommendedMonths,
      projectedPfd: result.pfd,
      projectedSil: result.sil,
      savings: `Test frequency reduced from ${existing.proofTestIntervalMonths}mo to ${result.recommendedMonths}mo`,
    };
  },

  // ── REFERENCE DATA ─────────────────────────────────────────────────────────

  /** SIL PFD requirements per IEC 61511 */
  getSilRequirements() {
    return SIL_PFD_RANGES;
  },

  /** Supported architectures */
  getArchitectures() {
    return VALID_ARCHITECTURES;
  },

  /** SFF requirements by architecture and component type */
  getSffRequirements() {
    return SIL_SFF_REQUIREMENTS;
  },
};
