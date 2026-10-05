// ============================================================================
// RBI (RISK-BASED INSPECTION) SERVICE
// API 581 / API 580 — Probability & Consequence of Failure, 5×5 Risk Matrix
// ============================================================================

import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import type { Prisma } from '@prisma/client';

const log = createLogger('RBIService');

// ── TYPES ────────────────────────────────────────────────────────────────────

export interface DegradationMechanism {
  mechanism: string;
  rate: number;
  description?: string;
}

export interface OperatingConditions {
  temperature?: number;   // °C
  pressure?: number;      // bar / MPa
  fluid?: string;
  h2sConcentration?: number;
  co2Concentration?: number;
  flowRate?: number;
  [key: string]: unknown;
}

export interface CreateRbiAssessmentData {
  assetId: string;
  equipmentType?: string;
  corrosionCircuit?: string;
  operatingConditions?: OperatingConditions;
  degradationMechanisms?: DegradationMechanism[];
  probabilityOfFailure: number;
  consequenceOfFailure: number;
  currentDamageFactor?: number;
  inspectionEffectiveness?: string;
  thinningRate?: number;
  currentThickness?: number;
  minimumThickness?: number;
  notes?: string;
  assessedById: string;
  approvedById?: string;
  status?: string;
}

export interface ListRbiParams {
  assetId?: string;
  assetIds?: string[];
  riskCategory?: string;
  corrosionCircuit?: string;
  status?: string;
  page?: number;
  limit?: number;
}

// ── CONSTANTS ────────────────────────────────────────────────────────────────

const RISK_CATEGORIES: Record<string, { label: string; range: string; action: string }> = {
  I:   { label: 'Low Risk',       range: '0.00–0.04', action: 'Monitor, extended intervals' },
  II:  { label: 'Medium Risk',    range: '0.05–0.12', action: 'Schedule inspection per code' },
  III: { label: 'High Risk',      range: '0.13–0.25', action: 'Prioritize, shorten intervals' },
  IV:  { label: 'Very High Risk', range: '0.26–0.40', action: 'Urgent inspection needed' },
  V:   { label: 'Critical Risk',  range: '0.41–1.00', action: 'Immediate action required' },
};

const INSPECTION_EFFECTIVENESS: Record<string, { label: string; reduction: number; description: string }> = {
  A: { label: 'Highly Effective',   reduction: 0.95, description: 'NDE finds damage with high confidence' },
  B: { label: 'Usually Effective',  reduction: 0.70, description: 'Effective for most expected damage' },
  C: { label: 'Fairly Effective',   reduction: 0.40, description: 'Moderate probability of finding damage' },
  D: { label: 'Poorly Effective',   reduction: 0.20, description: 'Low probability of finding damage' },
  E: { label: 'Ineffective',        reduction: 0.10, description: 'Not expected to find damage' },
  F: { label: 'Not Effective',      reduction: 0.00, description: 'No inspection performed' },
};

const VALID_DEGRADATION_MECHANISMS = [
  'corrosion', 'erosion', 'fatigue', 'creep',
  'hic_sohic', 'brittle_fracture', 'stress_corrosion_cracking',
  'high_temperature_hydrogen_attack', 'naphthenic_acid_corrosion',
];

const VALID_INSPECTION_EFFECTIVENESS = ['A', 'B', 'C', 'D', 'E', 'F'];
const VALID_STATUSES = ['active', 'closed', 'superseded'];

// ── HELPERS ──────────────────────────────────────────────────────────────────

/** Determine risk category from PoF × CoF score on a 5×5 matrix */
function classifyRisk(riskScore: number): string {
  if (riskScore <= 0.04) return 'I';
  if (riskScore <= 0.12) return 'II';
  if (riskScore <= 0.25) return 'III';
  if (riskScore <= 0.40) return 'IV';
  return 'V';
}

/** Estimate remaining life (years) based on thinning and thickness data */
function estimateRemainingLife(
  currentThickness: number,
  minimumThickness: number,
  thinningRate: number,
  inspectionEffectiveness?: string
): number {
  if (thinningRate <= 0) return 99; // No degradation
  const tRemaining = currentThickness - minimumThickness;
  if (tRemaining <= 0) return 0;

  const rawLife = tRemaining / thinningRate;
  const efReduction = inspectionEffectiveness
    ? (INSPECTION_EFFECTIVENESS[inspectionEffectiveness]?.reduction ?? 1)
    : 1;
  // Inspection effectiveness factor adjusts confidence interval
  const adjustedLife = rawLife * (0.5 + 0.5 * efReduction);
  return Math.round(adjustedLife * 100) / 100;
}

/** Calculate damage factor (0–1) considering degradation mechanisms */
function calculateDamageFactor(
  mechanisms: DegradationMechanism[],
  operatingConditions?: OperatingConditions
): number {
  if (!mechanisms.length) return 0;

  let maxFactor = 0;
  for (const m of mechanisms) {
    let factor = Math.min(1, m.rate / 2); // Normalise rate to 0–1 range
    // Adjust for operating conditions severity
    if (operatingConditions?.temperature && operatingConditions.temperature > 200) {
      factor *= 1.2; // High temp accelerates degradation
    }
    if (operatingConditions?.h2sConcentration && operatingConditions.h2sConcentration > 0) {
      factor *= 1.15; // Sour service
    }
    maxFactor = Math.max(maxFactor, Math.min(1, factor));
  }
  return Math.round(maxFactor * 1000) / 1000;
}

/** Calculate next inspection date based on remaining life and effectiveness */
function calculateNextInspection(
  remainingLifeYears: number,
  effectivenessCategory?: string
): Date {
  const ef = effectivenessCategory
    ? (INSPECTION_EFFECTIVENESS[effectivenessCategory]?.reduction ?? 0.5)
    : 0.5;

  // Inspection interval = fraction of remaining life based on effectiveness
  const intervalYears = Math.max(0.25, remainingLifeYears * ef * 0.5);
  const nextDate = new Date();
  nextDate.setFullYear(nextDate.getFullYear() + Math.min(intervalYears, 10));
  return nextDate;
}

// ── SERVICE ──────────────────────────────────────────────────────────────────

export const rbiService = {

  /**
   * List RBI assessments with optional filtering
   */
  async listAssessments(params: ListRbiParams) {
    const timer = log.timer('listAssessments');
    const { assetId, assetIds, riskCategory, corrosionCircuit, status, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (assetId) where.assetId = assetId;
    else if (assetIds) where.assetId = { in: assetIds };
    if (riskCategory) where.riskCategory = riskCategory;
    if (corrosionCircuit) where.corrosionCircuit = corrosionCircuit;
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      db.rbiAssessment.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.rbiAssessment.count({ where }),
    ]);

    timer.end();
    return {
      items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },

  /**
   * Get full RBI summary by plant, equipment type, or corrosion circuit
   */
  async getSummary(groupBy?: string, assetIds?: string[] | null) {
    const timer = log.timer('getSummary');

    const assessments = await db.rbiAssessment.findMany({
      where: {
        status: 'active',
        ...(assetIds ? { assetId: { in: assetIds } } : {}),
      },
    });

    const summary: Record<string, { count: number; avgRiskScore: number; categories: Record<string, number> }> = {};

    for (const a of assessments) {
      const key = groupBy === 'corrosionCircuit' && a.corrosionCircuit
        ? a.corrosionCircuit
        : groupBy === 'equipmentType' && a.equipmentType
          ? a.equipmentType
          : a.assetId;

      if (!summary[key]) {
        summary[key] = { count: 0, avgRiskScore: 0, categories: { I: 0, II: 0, III: 0, IV: 0, V: 0 } };
      }
      summary[key].count += 1;
      summary[key].avgRiskScore += a.riskScore;
      const cat = a.riskCategory as keyof typeof summary[string]['categories'];
      if (cat in summary[key].categories) {
        summary[key].categories[cat] += 1;
      }
    }

    // Average out
    for (const key in summary) {
      summary[key].avgRiskScore = Math.round(
        (summary[key].avgRiskScore / summary[key].count) * 1000
      ) / 1000;
    }

    timer.end();
    return summary;
  },

  /**
   * Create a new RBI assessment — auto-computes risk category, remaining life, next inspection
   */
  async createAssessment(data: CreateRbiAssessmentData) {
    const timer = log.timer('createAssessment');

    // Validate
    if (data.probabilityOfFailure < 0 || data.probabilityOfFailure > 1) {
      throw new ValidationError({ probabilityOfFailure: 'Must be between 0.0 and 1.0' });
    }
    if (data.consequenceOfFailure < 0 || data.consequenceOfFailure > 1) {
      throw new ValidationError({ consequenceOfFailure: 'Must be between 0.0 and 1.0' });
    }
    if (data.inspectionEffectiveness && !VALID_INSPECTION_EFFECTIVENESS.includes(data.inspectionEffectiveness)) {
      throw new ValidationError({ inspectionEffectiveness: `Must be one of: ${VALID_INSPECTION_EFFECTIVENESS.join(', ')}` });
    }

    // Validate degradation mechanisms
    if (data.degradationMechanisms) {
      for (const m of data.degradationMechanisms) {
        if (!VALID_DEGRADATION_MECHANISMS.includes(m.mechanism)) {
          throw new ValidationError({
            degradationMechanisms: `Invalid mechanism: ${m.mechanism}. Must be one of: ${VALID_DEGRADATION_MECHANISMS.join(', ')}`,
          });
        }
      }
    }

    const riskScore = Math.round(data.probabilityOfFailure * data.consequenceOfFailure * 10000) / 10000;
    const riskCategory = classifyRisk(riskScore);
    const mechanisms = data.degradationMechanisms ?? [];
    const currentDamageFactor = data.currentDamageFactor
      ?? calculateDamageFactor(mechanisms, data.operatingConditions);

    // Remaining life estimation
    let remainingLifeYears: number | undefined;
    let nextInspectionDate: Date | undefined;

    if (data.currentThickness != null && data.minimumThickness != null && data.thinningRate != null) {
      remainingLifeYears = estimateRemainingLife(
        data.currentThickness, data.minimumThickness, data.thinningRate,
        data.inspectionEffectiveness,
      );
      nextInspectionDate = calculateNextInspection(remainingLifeYears, data.inspectionEffectiveness);
    }

    const assessment = await db.rbiAssessment.create({
      data: {
        assetId: data.assetId,
        equipmentType: data.equipmentType,
        corrosionCircuit: data.corrosionCircuit,
        operatingConditions: data.operatingConditions === undefined
          ? undefined
          : data.operatingConditions as unknown as Prisma.InputJsonValue,
        degradationMechanisms: mechanisms.length > 0
          ? mechanisms as unknown as Prisma.InputJsonValue
          : undefined,
        probabilityOfFailure: data.probabilityOfFailure,
        consequenceOfFailure: data.consequenceOfFailure,
        riskCategory,
        riskScore,
        currentDamageFactor,
        inspectionEffectiveness: data.inspectionEffectiveness,
        nextInspectionDate,
        remainingLifeYears,
        thinningRate: data.thinningRate,
        currentThickness: data.currentThickness,
        minimumThickness: data.minimumThickness,
        notes: data.notes,
        assessedById: data.assessedById,
        approvedById: data.approvedById,
      },
    });

    timer.end();
    log.info('RBI assessment created', { id: assessment.id, riskCategory, riskScore });
    return assessment;
  },

  /**
   * Get a single RBI assessment by ID
   */
  async getAssessment(id: string) {
    const assessment = await db.rbiAssessment.findUnique({ where: { id } });
    if (!assessment) throw new NotFoundError('RbiAssessment', id);
    return assessment;
  },

  /**
   * Update an RBI assessment — recomputes derived fields
   */
  async updateAssessment(id: string, data: Partial<CreateRbiAssessmentData>) {
    const existing = await db.rbiAssessment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('RbiAssessment', id);

    if (data.probabilityOfFailure != null && (data.probabilityOfFailure < 0 || data.probabilityOfFailure > 1)) {
      throw new ValidationError({ probabilityOfFailure: 'Must be between 0.0 and 1.0' });
    }
    if (data.consequenceOfFailure != null && (data.consequenceOfFailure < 0 || data.consequenceOfFailure > 1)) {
      throw new ValidationError({ consequenceOfFailure: 'Must be between 0.0 and 1.0' });
    }
    if (data.status && !VALID_STATUSES.includes(data.status)) {
      throw new ValidationError({ status: `Must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    const pof = data.probabilityOfFailure ?? existing.probabilityOfFailure;
    const cof = data.consequenceOfFailure ?? existing.consequenceOfFailure;
    const riskScore = Math.round(pof * cof * 10000) / 10000;
    const riskCategory = classifyRisk(riskScore);

    // Recalculate remaining life if thickness data changes
    let remainingLifeYears = existing.remainingLifeYears;
    let nextInspectionDate = existing.nextInspectionDate;
    const thinningRate = data.thinningRate ?? existing.thinningRate;
    const currentThickness = data.currentThickness ?? existing.currentThickness;
    const minimumThickness = data.minimumThickness ?? existing.minimumThickness;
    const effectiveness = data.inspectionEffectiveness ?? existing.inspectionEffectiveness ?? undefined;

    if (currentThickness != null && minimumThickness != null && thinningRate != null) {
      remainingLifeYears = estimateRemainingLife(currentThickness, minimumThickness, thinningRate, effectiveness);
      nextInspectionDate = calculateNextInspection(remainingLifeYears, effectiveness);
    }

    const updateData: Prisma.RbiAssessmentUncheckedUpdateInput = {
      ...data,
      operatingConditions: data.operatingConditions === undefined
        ? undefined
        : data.operatingConditions as unknown as Prisma.InputJsonValue,
      degradationMechanisms: data.degradationMechanisms === undefined
        ? undefined
        : data.degradationMechanisms as unknown as Prisma.InputJsonValue,
      riskScore,
      riskCategory,
      remainingLifeYears,
      nextInspectionDate,
    };
    delete updateData.assessedById; // Don't change assessor on update

    const updated = await db.rbiAssessment.update({
      where: { id },
      data: updateData,
    });

    log.info('RBI assessment updated', { id, riskCategory });
    return updated;
  },

  /**
   * Delete an RBI assessment
   */
  async deleteAssessment(id: string) {
    const existing = await db.rbiAssessment.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('RbiAssessment', id);
    return db.rbiAssessment.delete({ where: { id } });
  },

  // ── REFERENCE DATA ─────────────────────────────────────────────────────────

  /** Get risk matrix reference data */
  getRiskMatrixReference() {
    return RISK_CATEGORIES;
  },

  /** Get inspection effectiveness categories */
  getInspectionEffectivenessReference() {
    return INSPECTION_EFFECTIVENESS;
  },

  /** Get supported degradation mechanisms */
  getDegradationMechanisms() {
    return VALID_DEGRADATION_MECHANISMS;
  },
};
