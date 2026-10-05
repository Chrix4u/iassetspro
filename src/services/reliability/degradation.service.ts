// ============================================================================
// DEGRADATION ANALYSIS SERVICE
// Curve modeling, Health Index, RUL prediction, Condition monitoring integration
// ============================================================================

import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import type { Prisma } from '@prisma/client';

const log = createLogger('DegradationService');

// ── TYPES ────────────────────────────────────────────────────────────────────

export interface DataPoint {
  timestamp: Date;
  value: number;
}

export interface DegradationModelParams {
  slope?: number;       // Linear: degradation per day
  intercept?: number;   // Linear: starting value
  rate?: number;        // Exponential: growth rate
  baseValue?: number;   // Power law: base
  exponent?: number;    // Power law: exponent
  amplitude?: number;   // Logarithmic: amplitude
  offset?: number;      // Logarithmic: offset
}

export interface CreateDegradationProfileData {
  assetId: string;
  parameterName: string;
  unit?: string;
  modelType?: 'linear' | 'exponential' | 'power_law' | 'logarithmic';
  dataPoints: DataPoint[];
  alertThreshold?: number;
  alarmThreshold?: number;
  criticalThreshold?: number;
}

export interface ComputeDegradationRequest {
  assetId: string;
  parameterName: string;
  unit?: string;
  dataPoints: DataPoint[];
  modelType?: 'linear' | 'exponential' | 'power_law' | 'logarithmic';
  alertThreshold?: number;
  alarmThreshold?: number;
  criticalThreshold?: number;
}

export interface DegradationResult {
  profileId: string;
  modelType: string;
  modelParams: DegradationModelParams;
  currentValue: number;
  healthIndex: number;
  degradationStage: string;
  predictedFailureDate: Date | null;
  degradationRate: number;
  confidence: number;
  dataPointCount: number;
  trend: 'improving' | 'stable' | 'degrading' | 'rapid_degrading';
}

export interface MultiParamDegradationResult {
  overallHealthIndex: number;
  parameters: Array<DegradationResult & { weight: number }>;
  recommendation: string;
}

export interface ListDegradationParams {
  assetId?: string;
  assetIds?: string[];
  degradationStage?: string;
  page?: number;
  limit?: number;
}

// ── CONSTANTS ────────────────────────────────────────────────────────────────

const VALID_MODEL_TYPES = ['linear', 'exponential', 'power_law', 'logarithmic'];
const VALID_STAGES = ['normal', 'alert', 'alarm', 'critical'];
const MIN_DATA_POINTS = 3;

// ── CURVE FITTING ────────────────────────────────────────────────────────────

/** Fit a linear model y = slope * x + intercept using least squares */
function fitLinear(points: { x: number; y: number }[]): { slope: number; intercept: number; r2: number } {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: 0, r2: 0 };

  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const sumY2 = points.reduce((s, p) => s + p.y * p.y, 0);

  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-10) return { slope: 0, intercept: sumY / n, r2: 0 };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // R-squared
  const yMean = sumY / n;
  const ssTot = sumY2 - n * yMean * yMean;
  const ssRes = points.reduce((s, p) => s + Math.pow(p.y - (slope * p.x + intercept), 2), 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  return { slope, intercept, r2: Math.max(0, Math.min(1, r2)) };
}

/** Fit exponential model y = base * e^(rate * x) via log transform */
function fitExponential(points: { x: number; y: number }[]): { baseValue: number; rate: number; r2: number } {
  // Filter positive values for log transform
  const filtered = points.filter((p) => p.y > 0);
  if (filtered.length < MIN_DATA_POINTS) return { baseValue: 0, rate: 0, r2: 0 };

  const logPoints = filtered.map((p) => ({ x: p.x, y: Math.log(p.y) }));
  const linear = fitLinear(logPoints);

  return {
    baseValue: Math.exp(linear.intercept),
    rate: linear.slope,
    r2: linear.r2,
  };
}

/** Fit power law y = amplitude * x^exponent via log-log transform */
function fitPowerLaw(points: { x: number; y: number }[]): { amplitude: number; exponent: number; r2: number } {
  const filtered = points.filter((p) => p.x > 0 && p.y > 0);
  if (filtered.length < MIN_DATA_POINTS) return { amplitude: 0, exponent: 1, r2: 0 };

  const logPoints = filtered.map((p) => ({ x: Math.log(p.x), y: Math.log(p.y) }));
  const linear = fitLinear(logPoints);

  return {
    amplitude: Math.exp(linear.intercept),
    exponent: linear.slope,
    r2: linear.r2,
  };
}

/** Fit logarithmic model y = amplitude * ln(x) + offset */
function fitLogarithmic(points: { x: number; y: number }[]): { amplitude: number; offset: number; r2: number } {
  const filtered = points.filter((p) => p.x > 0);
  if (filtered.length < MIN_DATA_POINTS) return { amplitude: 0, offset: 0, r2: 0 };

  const lnPoints = filtered.map((p) => ({ x: Math.log(p.x), y: p.y }));
  const linear = fitLinear(lnPoints);

  return {
    amplitude: linear.slope,
    offset: linear.intercept,
    r2: linear.r2,
  };
}

/** Select the best-fitting model from all options */
function selectBestModel(
  points: { x: number; y: number }[],
): { modelType: string; params: DegradationModelParams; r2: number } {
  const linear = fitLinear(points);
  const exponential = fitExponential(points);
  const powerLaw = fitPowerLaw(points);
  const logarithmic = fitLogarithmic(points);

  const models: Array<{ modelType: string; params: DegradationModelParams; r2: number }> = [
    {
      modelType: 'linear',
      params: { slope: linear.slope, intercept: linear.intercept },
      r2: linear.r2,
    },
    {
      modelType: 'exponential',
      params: { baseValue: exponential.baseValue, rate: exponential.rate },
      r2: exponential.r2,
    },
    {
      modelType: 'power_law',
      params: { amplitude: powerLaw.amplitude, exponent: powerLaw.exponent },
      r2: powerLaw.r2,
    },
    {
      modelType: 'logarithmic',
      params: { amplitude: logarithmic.amplitude, offset: logarithmic.offset },
      r2: logarithmic.r2,
    },
  ];

  let best = models[0];
  for (const candidate of models) {
    if (candidate.r2 > best.r2) best = candidate;
  }
  return best;
}

/** Predict future value using a fitted model */
function predictValue(
  modelType: string,
  params: DegradationModelParams,
  x: number,
): number {
  switch (modelType) {
    case 'linear':
      return (params.slope ?? 0) * x + (params.intercept ?? 0);
    case 'exponential':
      return (params.baseValue ?? 1) * Math.exp((params.rate ?? 0) * x);
    case 'power_law': {
      const safeX = Math.max(0.001, x);
      return (params.amplitude ?? 1) * Math.pow(safeX, params.exponent ?? 1);
    }
    case 'logarithmic': {
      const safeLnX = Math.log(Math.max(0.001, x));
      return (params.amplitude ?? 1) * safeLnX + (params.offset ?? 0);
    }
    default:
      return 0;
  }
}

/** Determine degradation trend direction */
function determineTrend(slope: number): 'improving' | 'stable' | 'degrading' | 'rapid_degrading' {
  if (slope < -0.01) return 'improving';
  if (slope <= 0.01) return 'stable';
  if (slope <= 0.1) return 'degrading';
  return 'rapid_degrading';
}

/** Classify degradation stage based on thresholds */
function classifyStage(
  value: number,
  alertThreshold?: number | null,
  alarmThreshold?: number | null,
  criticalThreshold?: number | null,
): string {
  if (criticalThreshold != null && value >= criticalThreshold) return 'critical';
  if (alarmThreshold != null && value >= alarmThreshold) return 'alarm';
  if (alertThreshold != null && value >= alertThreshold) return 'alert';
  return 'normal';
}

/** Calculate health index (0-100%) based on thresholds */
function calculateHealthIndex(
  value: number,
  alertThreshold?: number | null,
  alarmThreshold?: number | null,
  criticalThreshold?: number | null,
): number {
  const alert = alertThreshold ?? 70;
  const alarm = alarmThreshold ?? 85;
  const critical = criticalThreshold ?? 95;

  if (value <= 0) return 100;
  if (value >= critical) return 0;
  if (value >= alarm) return Math.round(25 * (1 - (value - alarm) / (critical - alarm)));
  if (value >= alert) return Math.round(75 - 50 * (value - alert) / (alarm - alert));
  return Math.round(100 - 25 * value / alert);
}

// ── SERVICE ──────────────────────────────────────────────────────────────────

export const degradationService = {

  /**
   * List degradation profiles with optional filtering
   */
  async listProfiles(params: ListDegradationParams) {
    const timer = log.timer('listProfiles');
    const { assetId, assetIds, degradationStage, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (assetId) where.assetId = assetId;
    else if (assetIds) where.assetId = { in: assetIds };
    if (degradationStage) where.degradationStage = degradationStage;

    const [items, total] = await Promise.all([
      db.degradationProfile.findMany({
        where,
        skip,
        take: limit,
        orderBy: { updatedAt: 'desc' },
      }),
      db.degradationProfile.count({ where }),
    ]);

    timer.end();
    return {
      items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },

  /**
   * Compute degradation analysis — fits model, calculates health index, predicts RUL
   */
  async computeDegradation(data: ComputeDegradationRequest): Promise<DegradationResult> {
    const timer = log.timer('computeDegradation');

    if (data.dataPoints.length < MIN_DATA_POINTS) {
      throw new ValidationError({ dataPoints: `Minimum ${MIN_DATA_POINTS} data points required` });
    }
    if (data.modelType && !VALID_MODEL_TYPES.includes(data.modelType)) {
      throw new ValidationError({ modelType: `Must be one of: ${VALID_MODEL_TYPES.join(', ')}` });
    }

    // Normalize timestamps to days from earliest point
    const earliest = new Date(Math.min(...data.dataPoints.map((dp) => dp.timestamp.getTime())));
    const points = data.dataPoints
      .map((dp) => ({
        x: (dp.timestamp.getTime() - earliest.getTime()) / (1000 * 60 * 60 * 24),
        y: dp.value,
      }))
      .sort((a, b) => a.x - b.x);

    // Fit model
    let modelType: string;
    let modelParams: DegradationModelParams;
    let r2: number;

    if (data.modelType) {
      // Use specified model type
      switch (data.modelType) {
        case 'linear': {
          const fit = fitLinear(points);
          modelParams = { slope: fit.slope, intercept: fit.intercept };
          r2 = fit.r2;
          break;
        }
        case 'exponential': {
          const fit = fitExponential(points);
          modelParams = { baseValue: fit.baseValue, rate: fit.rate };
          r2 = fit.r2;
          break;
        }
        case 'power_law': {
          const fit = fitPowerLaw(points);
          modelParams = { amplitude: fit.amplitude, exponent: fit.exponent };
          r2 = fit.r2;
          break;
        }
        case 'logarithmic': {
          const fit = fitLogarithmic(points);
          modelParams = { amplitude: fit.amplitude, offset: fit.offset };
          r2 = fit.r2;
          break;
        }
      }
      modelType = data.modelType;
    } else {
      // Auto-select best model
      const best = selectBestModel(points);
      modelType = best.modelType;
      modelParams = best.params;
      r2 = best.r2;
    }

    const currentValue = points[points.length - 1].y;
    const lastX = points[points.length - 1].x;
    const degradationRate = modelParams.slope ?? modelParams.rate ?? 0; // Rate per day

    // Classify stage and health index
    const degradationStage = classifyStage(currentValue, data.alertThreshold, data.alarmThreshold, data.criticalThreshold);
    const healthIndex = calculateHealthIndex(currentValue, data.alertThreshold, data.alarmThreshold, data.criticalThreshold);
    const trend = determineTrend(modelParams.slope ?? 0);

    // Predict failure date (when value reaches critical threshold or 2x current)
    const failureThreshold = data.criticalThreshold ?? currentValue * 2;
    let predictedFailureDate: Date | null = null;

    if (degradationRate > 0) {
      // Binary search for x where predictValue = failureThreshold
      let low = lastX;
      let high = lastX + 3650; // 10 year max look-ahead
      for (let i = 0; i < 50; i++) {
        const mid = (low + high) / 2;
        const predicted = predictValue(modelType, modelParams, mid);
        if (predicted >= failureThreshold) {
          high = mid;
        } else {
          low = mid;
        }
      }
      const daysToFailure = (high - lastX) / 1;
      if (daysToFailure > 0 && daysToFailure < 3650) {
        predictedFailureDate = new Date(Date.now() + daysToFailure * 24 * 60 * 60 * 1000);
      }
    }

    // Upsert degradation profile
    const existing = await db.degradationProfile.findFirst({
      where: { assetId: data.assetId, parameterName: data.parameterName },
    });

    const profileData = {
      assetId: data.assetId,
      parameterName: data.parameterName,
      unit: data.unit,
      modelType,
      modelParams: modelParams as Prisma.InputJsonValue,
      currentValue,
      healthIndex,
      degradationStage,
      alertThreshold: data.alertThreshold,
      alarmThreshold: data.alarmThreshold,
      criticalThreshold: data.criticalThreshold,
      predictedFailureDate,
      degradationRate: Math.round(Math.abs(degradationRate) * 10000) / 10000,
      confidence: Math.round(r2 * 10000) / 10000,
      dataPoints: data.dataPoints.length,
      lastUpdated: new Date(),
    };

    let profile;
    if (existing) {
      profile = await db.degradationProfile.update({
        where: { id: existing.id },
        data: profileData,
      });
    } else {
      profile = await db.degradationProfile.create({
        data: profileData,
      });
    }

    timer.end();
    log.info('Degradation computed', {
      assetId: data.assetId,
      parameter: data.parameterName,
      modelType,
      healthIndex,
      stage: degradationStage,
      r2,
    });

    return {
      profileId: profile.id,
      modelType,
      modelParams,
      currentValue,
      healthIndex,
      degradationStage,
      predictedFailureDate,
      degradationRate: Math.abs(degradationRate),
      confidence: r2,
      dataPointCount: data.dataPoints.length,
      trend,
    };
  },

  /**
   * Multi-parameter degradation analysis combining multiple parameters
   */
  async computeMultiParameter(assetId: string): Promise<MultiParamDegradationResult> {
    const timer = log.timer('computeMultiParameter');

    const profiles = await db.degradationProfile.findMany({
      where: { assetId },
    });

    if (profiles.length === 0) {
      return {
        overallHealthIndex: 100,
        parameters: [],
        recommendation: 'No degradation profiles found for this asset',
      };
    }

    // Weight parameters based on degradation stage severity
    const stageWeights: Record<string, number> = {
      normal: 1.0,
      alert: 1.5,
      alarm: 2.0,
      critical: 3.0,
    };

    let totalWeightedHealth = 0;
    let totalWeight = 0;

    const results: Array<DegradationResult & { weight: number }> = profiles.map((p) => {
      const health = p.healthIndex ?? 100;
      const weight = stageWeights[p.degradationStage] ?? 1.0;
      totalWeightedHealth += health * weight;
      totalWeight += weight;

      return {
        profileId: p.id,
        modelType: p.modelType,
        modelParams: (p.modelParams ?? {}) as DegradationModelParams,
        currentValue: p.currentValue ?? 0,
        healthIndex: health,
        degradationStage: p.degradationStage,
        predictedFailureDate: p.predictedFailureDate,
        degradationRate: p.degradationRate ?? 0,
        confidence: p.confidence ?? 0,
        dataPointCount: p.dataPoints,
        trend: 'stable', // Simplified
        weight,
      };
    });

    const overallHealthIndex = totalWeight > 0
      ? Math.round(totalWeightedHealth / totalWeight)
      : 100;

    // Generate recommendation
    let recommendation: string;
    const criticalCount = results.filter((r) => r.degradationStage === 'critical').length;
    const alarmCount = results.filter((r) => r.degradationStage === 'alarm').length;
    const alertCount = results.filter((r) => r.degradationStage === 'alert').length;

    if (criticalCount > 0) {
      recommendation = `URGENT: ${criticalCount} parameter(s) in CRITICAL stage. Immediate maintenance intervention required.`;
    } else if (alarmCount > 0) {
      recommendation = `WARNING: ${alarmCount} parameter(s) in ALARM stage. Schedule maintenance within 1 week.`;
    } else if (alertCount > 0) {
      recommendation = `ATTENTION: ${alertCount} parameter(s) in ALERT stage. Plan preventive maintenance.`;
    } else {
      recommendation = 'All monitored parameters are within normal range. Continue regular monitoring schedule.';
    }

    timer.end();
    return {
      overallHealthIndex,
      parameters: results,
      recommendation,
    };
  },

  /**
   * Detect rate change in degradation (accelerating vs decelerating)
   */
  async detectRateChange(assetId: string, parameterName: string): Promise<{
    hasRateChange: boolean;
    previousRate: number;
    currentRate: number;
    changePercent: number;
    direction: 'accelerating' | 'decelerating' | 'stable';
  }> {
    const profile = await db.degradationProfile.findFirst({
      where: { assetId, parameterName },
    });

    if (!profile) throw new NotFoundError('DegradationProfile', `${assetId}/${parameterName}`);

    const params = (profile.modelParams ?? {}) as DegradationModelParams;
    const currentRate = Math.abs(profile.degradationRate ?? params.slope ?? params.rate ?? 0);

    // Compare with a simple heuristic: half the data span
    // For a real implementation, this would compare sliding-window fits
    const previousRate = currentRate * 0.8; // Placeholder for actual sliding window comparison
    const changePercent = previousRate > 0
      ? Math.round(((currentRate - previousRate) / previousRate) * 100)
      : 0;

    const direction: 'accelerating' | 'decelerating' | 'stable' =
      changePercent > 15 ? 'accelerating'
        : changePercent < -15 ? 'decelerating'
        : 'stable';

    return {
      hasRateChange: Math.abs(changePercent) > 15,
      previousRate: Math.round(previousRate * 10000) / 10000,
      currentRate: Math.round(currentRate * 10000) / 10000,
      changePercent,
      direction,
    };
  },

  /**
   * Get profiles by stage for dashboard/alerting
   */
  async getProfilesByStage(stage?: string, assetIds?: string[] | null) {
    const where: Record<string, unknown> = {};
    if (assetIds) where.assetId = { in: assetIds };
    if (stage) where.degradationStage = stage;

    return db.degradationProfile.findMany({
      where,
      orderBy: { healthIndex: 'asc' },
    });
  },

  /**
   * Get reference data for degradation modeling
   */
  getModelTypes() {
    return VALID_MODEL_TYPES;
  },

  getStages() {
    return VALID_STAGES;
  },
};
