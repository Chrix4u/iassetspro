// ============================================================================
// ASSET LIFECYCLE FORECASTING SERVICE
// TCO, Replacement Optimization, Health Trajectory, Maintenance Cost Forecasting
// ============================================================================

import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import type { Prisma } from '@prisma/client';

const log = createLogger('LifecycleForecastService');

// ── TYPES ────────────────────────────────────────────────────────────────────

export interface ComputeTcoRequest {
  assetId: string;
  createdById: string;
  forecastPeriodMonths?: number;
  acquisitionCost?: number;
  annualOperatingCost?: number;
  annualMaintenanceCost?: number;
  disposalCost?: number;
  discountRate?: number;        // % per annum for NPV calculation
  expectedLifeYears?: number;
}

export interface TcoResult {
  totalCost: number;
  npv: number;                  // Net Present Value
  acquisitionCost: number;
  operatingCost: number;
  maintenanceCost: number;
  disposalCost: number;
  annualizedCost: number;
  costPerDay: number;
  monthlyBreakdown: Array<{ month: number; cumulativeCost: number; monthlyCost: number }>;
  recommendedAction: string;
  confidence: number;
}

export interface MaintenanceCostForecast {
  assetId: string;
  forecastPeriodMonths: number;
  monthlyForecast: Array<{ month: number; predictedCost: number; confidence: number }>;
  totalPredicted: number;
  trend: 'increasing' | 'stable' | 'decreasing';
  avgMonthlyCost: number;
}

export interface ReplacementAnalysis {
  shouldReplace: boolean;
  replacementDate: Date | null;
  replacementReason: string;
  costOfContinuing: number;
  costOfReplacement: number;
  savingsFromReplacement: number;
  roiPercent: number;
  paybackMonths: number;
}

export interface HealthTrajectoryPoint {
  month: number;
  healthIndex: number;
  predictedFailureProbability: number;
}

export interface LifecycleForecastResult {
  id: string;
  forecastType: string;
  assetId: string;
  forecastPeriodMonths: number;
  totalCost?: number;
  acquisitionCost?: number;
  operatingCost?: number;
  maintenanceCost?: number;
  disposalCost?: number;
  replacementDate?: Date | null;
  replacementReason?: string;
  recommendedAction?: string;
  confidence?: number;
  data?: Record<string, unknown>;
}

export interface ListForecastParams {
  assetId?: string;
  assetIds?: string[];
  forecastType?: string;
  page?: number;
  limit?: number;
}

// ── VALID FORECAST TYPES ─────────────────────────────────────────────────────

const VALID_FORECAST_TYPES = ['tco', 'replacement', 'maintenance_cost', 'health_trajectory'];
const VALID_ACTIONS = ['continue_maintenance', 'repair', 'replace', 'upgrade'];

// ── HELPERS ──────────────────────────────────────────────────────────────────

/** Net Present Value calculation */
function calculateNPV(
  cashFlows: number[],
  discountRatePercent: number,
): number {
  const rate = discountRatePercent / 100;
  let npv = 0;
  for (let t = 0; t < cashFlows.length; t++) {
    npv += cashFlows[t] / Math.pow(1 + rate / 12, t); // Monthly discounting
  }
  return npv;
}

/** Fetch historical maintenance cost data for an asset */
async function getHistoricalMaintenanceCosts(assetId: string): Promise<Array<{ month: string; cost: number }>> {
  const workOrders = await db.workOrder.findMany({
    where: { assetId, totalCost: { gt: 0 }, status: { in: ['completed', 'closed'] } },
    select: { totalCost: true, actualEnd: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });

  // Group by month
  const monthly: Record<string, number> = {};
  for (const wo of workOrders) {
    const date = wo.actualEnd ?? wo.createdAt;
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    monthly[key] = (monthly[key] ?? 0) + wo.totalCost;
  }

  return Object.entries(monthly)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, cost]) => ({ month, cost }));
}

/** Linear regression for cost trending */
function linearRegression(values: number[]): { slope: number; intercept: number } {
  const n = values.length;
  if (n < 2) return { slope: 0, intercept: values[0] ?? 0 };

  const sumX = values.reduce((s, _, i) => s + i, 0);
  const sumY = values.reduce((s, y) => s + y, 0);
  const sumXY = values.reduce((s, y, i) => s + i * y, 0);
  const sumX2 = values.reduce((s, _, i) => s + i * i, 0);

  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-10) return { slope: 0, intercept: sumY / n };

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

/** Get asset health history */
async function getAssetHealthHistory(assetId: string): Promise<Array<{ date: Date; healthIndex: number }>> {
  const asset = await db.asset.findUnique({
    where: { id: assetId },
    select: {
      expectedLifeYears: true,
      purchaseDate: true,
      digitalTwin: { select: { healthScore: true } },
    },
  });
  if (!asset) throw new NotFoundError('Asset', assetId);

  // Digital Twin is the canonical live health source; fall back to a neutral estimate.
  const currentHealth = asset.digitalTwin?.healthScore ?? 50;
  const points: Array<{ date: Date; healthIndex: number }> = [];

  if (asset.purchaseDate) {
    const ageMonths = Math.floor(
      (Date.now() - asset.purchaseDate.getTime()) / (1000 * 60 * 60 * 24 * 30)
    );
    // Simple linear degradation model based on age and expected life
    const expectedLifeMonths = (asset.expectedLifeYears ?? 20) * 12;
    const degradationPerMonth = 100 / expectedLifeMonths;
    const currentHealthEstimate = Math.max(0, 100 - degradationPerMonth * ageMonths);
    points.push({ date: new Date(), healthIndex: currentHealthEstimate });
  } else {
    points.push({ date: new Date(), healthIndex: currentHealth });
  }

  return points;
}

// ── SERVICE ──────────────────────────────────────────────────────────────────

export const lifecycleForecastService = {

  /**
   * List lifecycle forecasts
   */
  async listForecasts(params: ListForecastParams) {
    const timer = log.timer('listForecasts');
    const { assetId, assetIds, forecastType, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (assetId) where.assetId = assetId;
    else if (assetIds) where.assetId = { in: assetIds };
    if (forecastType) where.forecastType = forecastType;

    const [items, total] = await Promise.all([
      db.lifecycleForecast.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      db.lifecycleForecast.count({ where }),
    ]);

    timer.end();
    return {
      items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },

  /**
   * Compute Total Cost of Ownership (TCO)
   */
  async computeTCO(data: ComputeTcoRequest): Promise<TcoResult & { forecastId: string }> {
    const timer = log.timer('computeTCO');

    const asset = await db.asset.findUnique({
      where: { id: data.assetId },
      select: {
        id: true, name: true, purchaseCost: true, expectedLifeYears: true,
        purchaseDate: true, currentValue: true,
      },
    });
    if (!asset) throw new NotFoundError('Asset', data.assetId);

    const periodMonths = data.forecastPeriodMonths ?? 36;
    const discountRate = data.discountRate ?? 8;
    const expectedLifeYears = data.expectedLifeYears ?? asset.expectedLifeYears ?? 20;

    // Get historical costs
    const historical = await getHistoricalMaintenanceCosts(data.assetId);
    const historicalCosts = historical.map((h) => h.cost);
    const avgHistoricalMonthly = historicalCosts.length > 0
      ? historicalCosts.reduce((s, c) => s + c, 0) / historicalCosts.length
      : 0;

    // Cost components
    const acquisitionCost = data.acquisitionCost ?? asset.purchaseCost ?? 0;
    const disposalCost = data.disposalCost ?? acquisitionCost * 0.05;
    const annualOperatingCost = data.annualOperatingCost ?? acquisitionCost * 0.08;
    const annualMaintenanceCost = data.annualMaintenanceCost ?? avgHistoricalMonthly * 12;

    // Monthly breakdown
    const monthlyOperating = annualOperatingCost / 12;
    const monthlyMaintenance = annualMaintenanceCost / 12;

    // Trend analysis on historical costs
    const trend = historicalCosts.length >= 3
      ? linearRegression(historicalCosts)
      : { slope: 0, intercept: monthlyMaintenance };

    const monthlyBreakdown: Array<{ month: number; cumulativeCost: number; monthlyCost: number }> = [];
    let cumulativeCost = acquisitionCost;
    const cashFlows: number[] = [acquisitionCost];

    for (let m = 1; m <= periodMonths; m++) {
      // Projected cost with trend and escalation
      const escalatedMaint = Math.max(0, monthlyMaintenance + trend.slope * (m - 1));
      const operatingEscalation = 1 + 0.03 * (m / 12); // 3% annual escalation
      const monthCost = monthlyOperating * operatingEscalation + escalatedMaint;
      cumulativeCost += monthCost;
      cashFlows.push(monthCost);

      monthlyBreakdown.push({
        month: m,
        cumulativeCost: Math.round(cumulativeCost * 100) / 100,
        monthlyCost: Math.round(monthCost * 100) / 100,
      });
    }

    // Add disposal cost
    cumulativeCost += disposalCost;
    cashFlows.push(disposalCost);

    const operatingCost = Math.round(monthlyBreakdown.reduce((s, m) => s + m.monthlyCost, 0) * 100) / 100;
    const maintenanceCost = Math.round(annualMaintenanceCost * (periodMonths / 12) * 100) / 100;
    const totalCost = Math.round(cumulativeCost * 100) / 100;
    const npv = Math.round(calculateNPV(cashFlows, discountRate) * 100) / 100;
    const annualizedCost = Math.round((totalCost / (periodMonths / 12)) * 100) / 100;
    const costPerDay = Math.round((annualizedCost / 365) * 100) / 100;

    // Recommendation
    let recommendedAction = 'continue_maintenance';
    if (totalCost > acquisitionCost * 2.5) {
      recommendedAction = 'replace';
    } else if (totalCost > acquisitionCost * 1.8) {
      recommendedAction = 'upgrade';
    }

    const confidence = historicalCosts.length >= 6 ? 0.8 : historicalCosts.length >= 3 ? 0.6 : 0.3;

    // Save forecast
    const forecast = await db.lifecycleForecast.create({
      data: {
        assetId: data.assetId,
        forecastType: 'tco',
        forecastPeriodMonths: periodMonths,
        totalCost,
        acquisitionCost,
        operatingCost,
        maintenanceCost,
        disposalCost,
        monthlyCostForecast: monthlyBreakdown,
        recommendedAction,
        confidence,
        data: {
          npv,
          annualizedCost,
          costPerDay,
          discountRate,
          historicalMonthsUsed: historicalCosts.length,
        },
        createdById: data.createdById,
      },
    });

    timer.end();
    log.info('TCO computed', {
      assetId: data.assetId,
      totalCost,
      periodMonths,
      confidence,
    });

    return {
      forecastId: forecast.id,
      totalCost,
      npv,
      acquisitionCost,
      operatingCost,
      maintenanceCost,
      disposalCost,
      annualizedCost,
      costPerDay,
      monthlyBreakdown,
      recommendedAction,
      confidence,
    };
  },

  /**
   * Forecast maintenance costs for the next N months
   */
  async forecastMaintenanceCosts(
    assetId: string,
    periodMonths: number = 12,
  ): Promise<MaintenanceCostForecast> {
    const timer = log.timer('forecastMaintenanceCosts');

    const historical = await getHistoricalMaintenanceCosts(assetId);
    const costs = historical.map((h) => h.cost);

    const trend = costs.length >= 2 ? linearRegression(costs) : { slope: 0, intercept: 0 };
    const avgMonthlyCost = costs.length > 0 ? costs.reduce((s, c) => s + c, 0) / costs.length : 0;
    const baseCost = trend.intercept + avgMonthlyCost / 2; // Blend trend and average
    const trendDirection: 'increasing' | 'stable' | 'decreasing' =
      trend.slope > 50 ? 'increasing'
        : trend.slope < -50 ? 'decreasing'
        : 'stable';

    const confidence = costs.length >= 12 ? 0.85 : costs.length >= 6 ? 0.7 : costs.length >= 3 ? 0.5 : 0.2;

    const monthlyForecast: Array<{ month: number; predictedCost: number; confidence: number }> = [];
    let totalPredicted = 0;

    for (let m = 1; m <= periodMonths; m++) {
      const predicted = Math.max(0, baseCost + trend.slope * m);
      // Seasonal variation (±15%)
      const seasonalFactor = 1 + 0.15 * Math.sin((m / 12) * 2 * Math.PI);
      const adjusted = predicted * seasonalFactor;
      totalPredicted += adjusted;

      monthlyForecast.push({
        month: m,
        predictedCost: Math.round(adjusted * 100) / 100,
        confidence,
      });
    }

    timer.end();
    return {
      assetId,
      forecastPeriodMonths: periodMonths,
      monthlyForecast,
      totalPredicted: Math.round(totalPredicted * 100) / 100,
      trend: trendDirection,
      avgMonthlyCost: Math.round(avgMonthlyCost * 100) / 100,
    };
  },

  /**
   * Replacement analysis — when to replace vs continue maintaining
   */
  async analyzeReplacement(
    assetId: string,
    replacementCost?: number,
): Promise<ReplacementAnalysis> {
    const timer = log.timer('analyzeReplacement');

    const asset = await db.asset.findUnique({
      where: { id: assetId },
      select: {
        id: true, name: true, purchaseCost: true, expectedLifeYears: true,
        currentValue: true, purchaseDate: true, condition: true, status: true,
        digitalTwin: { select: { healthScore: true } },
      },
    });
    if (!asset) throw new NotFoundError('Asset', assetId);

    const replaceCost = replacementCost ?? (asset.purchaseCost ?? 0);

    // Calculate remaining life
    let ageYears = 0;
    if (asset.purchaseDate) {
      ageYears = (Date.now() - asset.purchaseDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    }
    const expectedLife = asset.expectedLifeYears ?? 20;
    const lifeConsumed = Math.min(1, ageYears / expectedLife);
    const remainingLifeYears = Math.max(0, expectedLife - ageYears);

    // Cost of continuing: projected maintenance costs for remaining life
    const recentCosts = await getHistoricalMaintenanceCosts(assetId);
    const recentMonthlyCosts = recentCosts.slice(-12).map((c) => c.cost);
    const avgMonthlyMaint = recentMonthlyCosts.length > 0
      ? recentMonthlyCosts.reduce((s, c) => s + c, 0) / recentMonthlyCosts.length
      : 0;

    // Maintenance costs typically increase as assets age (wear-out curve)
    const costEscalation = 1 + lifeConsumed * 0.5; // 50% increase at end of life
    const futureMonthlyMaint = avgMonthlyMaint * costEscalation;
    const costOfContinuing = futureMonthlyMaint * 12 * remainingLifeYears;

    // Cost of replacement
    const costOfReplacement = replaceCost + replaceCost * 0.1; // +10% installation

    const savingsFromReplacement = costOfContinuing - costOfReplacement;
    const roiPercent = costOfReplacement > 0
      ? Math.round((savingsFromReplacement / costOfReplacement) * 100)
      : 0;
    const paybackMonths = futureMonthlyMaint > 0
      ? Math.round(costOfReplacement / futureMonthlyMaint)
      : 0;

    // Health-based decision
    const healthScore = asset.digitalTwin?.healthScore ?? 50;
    const conditionFactor: Record<string, number> = {
      new: 1.0, good: 0.9, fair: 0.6, poor: 0.3, out_of_service: 0.1,
    };
    const condMultiplier = conditionFactor[asset.condition] ?? 0.5;

    // Decision logic
    let shouldReplace = false;
    let replacementReason = '';
    let replacementDate: Date | null = null;

    if (healthScore < 20 || condMultiplier < 0.3) {
      shouldReplace = true;
      replacementReason = 'Asset health critically low — replacement strongly recommended';
      replacementDate = new Date();
    } else if (healthScore < 40 || lifeConsumed > 0.85) {
      shouldReplace = savingsFromReplacement > 0 || roiPercent > 20;
      replacementReason = shouldReplace
        ? 'Asset nearing end of useful life and replacement is cost-effective'
        : 'Asset aging but replacement not yet cost-effective';
      replacementDate = shouldReplace ? new Date(Date.now() + 180 * 24 * 60 * 60 * 1000) : null;
    } else if (roiPercent > 30 && paybackMonths < 24) {
      shouldReplace = true;
      replacementReason = 'Replacement offers strong ROI with quick payback';
      replacementDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    } else {
      replacementReason = 'Continue maintenance — replacement not economically justified at this time';
    }

    timer.end();
    log.info('Replacement analysis', {
      assetId,
      shouldReplace,
      savingsFromReplacement,
      roiPercent,
      paybackMonths,
    });

    return {
      shouldReplace,
      replacementDate,
      replacementReason,
      costOfContinuing: Math.round(costOfContinuing * 100) / 100,
      costOfReplacement: Math.round(costOfReplacement * 100) / 100,
      savingsFromReplacement: Math.round(savingsFromReplacement * 100) / 100,
      roiPercent,
      paybackMonths,
    };
  },

  /**
   * Health trajectory prediction for an asset
   */
  async predictHealthTrajectory(
    assetId: string,
    periodMonths: number = 36,
    createdById: string,
  ): Promise<HealthTrajectoryPoint[]> {
    const timer = log.timer('predictHealthTrajectory');

    const healthHistory = await getAssetHealthHistory(assetId);
    const currentHealth = healthHistory.length > 0
      ? healthHistory[healthHistory.length - 1].healthIndex
      : 50;

    // Estimate degradation rate from current health and asset age
    const asset = await db.asset.findUnique({
      where: { id: assetId },
      select: { expectedLifeYears: true, purchaseDate: true },
    });

    let degradationRatePerMonth = 100 / ((asset?.expectedLifeYears ?? 20) * 12);

    // Adjust degradation rate based on degradation profiles if available
    const degradationProfiles = await db.degradationProfile.findMany({
      where: { assetId },
      select: { degradationRate: true, degradationStage: true },
    });

    if (degradationProfiles.length > 0) {
      const avgRate = degradationProfiles.reduce((s, p) => s + (p.degradationRate ?? 0), 0) / degradationProfiles.length;
      // Use the higher of the two rates
      degradationRatePerMonth = Math.max(degradationRatePerMonth, avgRate * 30); // Convert daily to monthly
    }

    // Generate trajectory
    const trajectory: HealthTrajectoryPoint[] = [];
    for (let m = 0; m <= periodMonths; m++) {
      const healthIndex = Math.max(0, Math.round(currentHealth - degradationRatePerMonth * m));
      const failureProbability = Math.min(1, Math.round(Math.pow(1 - healthIndex / 100, 2) * 10000) / 10000);

      trajectory.push({
        month: m,
        healthIndex,
        predictedFailureProbability: failureProbability,
      });
    }

    // Save forecast
    await db.lifecycleForecast.create({
      data: {
        assetId,
        forecastType: 'health_trajectory',
        forecastPeriodMonths: periodMonths,
        healthTrajectory: trajectory as unknown as Prisma.InputJsonValue,
        recommendedAction: trajectory[trajectory.length - 1].healthIndex < 30
          ? 'replace'
          : 'continue_maintenance',
        confidence: degradationProfiles.length > 0 ? 0.7 : 0.4,
        createdById,
      },
    });

    timer.end();
    return trajectory;
  },

  /**
   * Capital expenditure planning — summary of replacement needs
   */
  async capexPlanning(plantId?: string, assetIds?: string[] | null) {
    const timer = log.timer('capexPlanning');

    const where: Record<string, unknown> = { isActive: true };
    if (plantId) where.plantId = plantId;
    else if (assetIds) where.id = { in: assetIds };

    const assets = await db.asset.findMany({
      where,
      select: {
        id: true, name: true, assetTag: true, criticality: true,
        expectedLifeYears: true, purchaseDate: true,
        purchaseCost: true, currentValue: true,
        digitalTwin: { select: { healthScore: true } },
      },
    });

    const capexItems: Array<{
      assetId: string;
      assetName: string;
      assetTag: string;
      criticality: string;
      currentHealth: number;
      estimatedReplacementCost: number;
      urgency: 'immediate' | '1_year' | '2_years' | '3_years' | 'planned';
    }> = [];

    for (const asset of assets) {
      const health = asset.digitalTwin?.healthScore ?? 50;
      let ageYears = 0;
      if (asset.purchaseDate) {
        ageYears = (Date.now() - asset.purchaseDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      }
      const lifeConsumed = asset.expectedLifeYears
        ? ageYears / asset.expectedLifeYears
        : 0;

      if (health < 30 || lifeConsumed > 0.9) {
        capexItems.push({
          assetId: asset.id,
          assetName: asset.name,
          assetTag: asset.assetTag,
          criticality: asset.criticality,
          currentHealth: health,
          estimatedReplacementCost: asset.purchaseCost ?? 0,
          urgency: health < 20 ? 'immediate' : '1_year',
        });
      } else if (health < 50 || lifeConsumed > 0.75) {
        capexItems.push({
          assetId: asset.id,
          assetName: asset.name,
          assetTag: asset.assetTag,
          criticality: asset.criticality,
          currentHealth: health,
          estimatedReplacementCost: asset.purchaseCost ?? 0,
          urgency: lifeConsumed > 0.85 ? '1_year' : '2_years',
        });
      } else if (health < 70) {
        capexItems.push({
          assetId: asset.id,
          assetName: asset.name,
          assetTag: asset.assetTag,
          criticality: asset.criticality,
          currentHealth: health,
          estimatedReplacementCost: asset.purchaseCost ?? 0,
          urgency: '3_years',
        });
      }
    }

    // Sort by urgency
    const urgencyOrder = { immediate: 0, '1_year': 1, '2_years': 2, '3_years': 3, planned: 4 };
    capexItems.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

    // Summary
    const totalCapex = capexItems.reduce((s, item) => s + item.estimatedReplacementCost, 0);
    const byUrgency = {
      immediate: capexItems.filter((i) => i.urgency === 'immediate').length,
      oneYear: capexItems.filter((i) => i.urgency === '1_year').length,
      twoYears: capexItems.filter((i) => i.urgency === '2_years').length,
      threeYears: capexItems.filter((i) => i.urgency === '3_years').length,
    };

    timer.end();
    return {
      items: capexItems,
      summary: {
        totalItems: capexItems.length,
        totalCapex: Math.round(totalCapex * 100) / 100,
        byUrgency,
      },
    };
  },
};
