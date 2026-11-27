// ============================================================================
// RELIABILITY ENGINEERING SERVICE — Failure Modes, RCM, Weibull, Downtime, RUL
// ============================================================================

import { createLogger } from '@/lib/logger';
import { db } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';

const log = createLogger('ReliabilityEngineering');

// ── TYPES ────────────────────────────────────────────────────────────────────

export interface ListFailureModesParams {
  page?: number;
  limit?: number;
  category?: string;
  severity?: string;
  search?: string;
  isActive?: boolean;
}

export interface CreateFailureModeData {
  name: string;
  code?: string;
  description?: string;
  category: string;
  severity?: string;
  detectionMethod?: string;
  iso14224Code?: string;
  createdById: string;
}

export interface CreateRcmAnalysisData {
  assetId: string;
  name: string;
  description?: string;
  methodology?: string;
  analysisDate?: string;
  nextReviewDate?: string;
  resultSummary?: string;
  riskMatrix?: string;
  createdById: string;
}

export interface ListRcmParams {
  assetId: string;
  status?: string;
  page?: number;
  limit?: number;
}

// ── GAMMA FUNCTION (Lanczos approximation) ───────────────────────────────────

function gammaApprox(z: number): number {
  if (z < 0.5) {
    return Math.PI / (Math.sin(Math.PI * z) * gammaApprox(1 - z));
  }
  z -= 1;
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  let x = c[0];
  for (let i = 1; i < g + 2; i++) {
    x += c[i] / (z + i);
  }
  const t = z + g + 0.5;
  return Math.sqrt(2 * Math.PI) * Math.pow(t, z + 0.5) * Math.exp(-t) * x;
}

// ── VALIDATION HELPERS ────────────────────────────────────────────────────────

const VALID_FAILURE_MODE_CATEGORIES = [
  'mechanical', 'electrical', 'hydraulic', 'pneumatic',
  'software', 'human_error', 'environmental',
];

const VALID_SEVERITY_LEVELS = ['low', 'medium', 'high', 'critical'];
const VALID_RCM_STATUSES = ['draft', 'in_progress', 'completed', 'approved'];
const VALID_RCM_METHODOLOGIES = ['full', 'streamlined', 'focused'];

function validateCategory(category: string): void {
  if (!VALID_FAILURE_MODE_CATEGORIES.includes(category)) {
    throw new ValidationError({ category: `Invalid category. Must be one of: ${VALID_FAILURE_MODE_CATEGORIES.join(', ')}` });
  }
}

function validateSeverity(severity: string): void {
  if (!VALID_SEVERITY_LEVELS.includes(severity)) {
    throw new ValidationError({ severity: `Invalid severity. Must be one of: ${VALID_SEVERITY_LEVELS.join(', ')}` });
  }
}

// ── SERVICE ───────────────────────────────────────────────────────────────────

export const reliabilityEngineeringService = {

  // ── FAILURE MODES ─────────────────────────────────────────────────────────

  async listFailureModes(params: ListFailureModesParams) {
    const timer = log.timer('listFailureModes');
    const { page = 1, limit = 20, category, severity, search, isActive } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (category) where.category = category;
    if (severity) where.severity = severity;
    if (isActive !== undefined) where.isActive = isActive;
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { code: { contains: search } },
        { description: { contains: search } },
      ];
    }

    const [items, total] = await Promise.all([
      db.failureMode.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: { select: { id: true, fullName: true, username: true } },
          _count: { select: { records: true } },
        },
      }),
      db.failureMode.count({ where }),
    ]);

    timer.end();
    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },

  async createFailureMode(data: CreateFailureModeData) {
    const timer = log.timer('createFailureMode');
    validateCategory(data.category);
    if (data.severity) validateSeverity(data.severity);

    // Check unique code
    if (data.code) {
      const existing = await db.failureMode.findUnique({ where: { code: data.code } });
      if (existing) {
        throw new ValidationError({ code: `Failure mode with code '${data.code}' already exists` });
      }
    }

    const failureMode = await db.failureMode.create({
      data: {
        name: data.name,
        code: data.code,
        description: data.description,
        category: data.category,
        severity: data.severity || 'medium',
        detectionMethod: data.detectionMethod,
        iso14224Code: data.iso14224Code,
        createdById: data.createdById,
      },
      include: {
        createdBy: { select: { id: true, fullName: true, username: true } },
      },
    });

    timer.end();
    log.info('Failure mode created', { id: failureMode.id, name: failureMode.name });
    return failureMode;
  },

  async getFailureMode(id: string) {
    const failureMode = await db.failureMode.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, fullName: true, username: true } },
        records: {
          take: 10,
          orderBy: { detectedAt: 'desc' },
          include: {
            component: { select: { id: true, name: true, componentCode: true } },
            asset: { select: { id: true, name: true, assetTag: true } },
          },
        },
        _count: { select: { records: true } },
      },
    });

    if (!failureMode) {
      throw new NotFoundError('FailureMode', id);
    }
    return failureMode;
  },

  async updateFailureMode(id: string, data: Partial<CreateFailureModeData>) {
    const existing = await db.failureMode.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('FailureMode', id);

    if (data.category) validateCategory(data.category);
    if (data.severity) validateSeverity(data.severity);

    if (data.code && data.code !== existing.code) {
      const codeExists = await db.failureMode.findUnique({ where: { code: data.code } });
      if (codeExists) {
        throw new ValidationError({ code: `Failure mode with code '${data.code}' already exists` });
      }
    }

    const updateData: Record<string, unknown> = { ...data };
    delete updateData.createdById;

    return db.failureMode.update({
      where: { id },
      data: updateData,
      include: {
        createdBy: { select: { id: true, fullName: true, username: true } },
      },
    });
  },

  async deleteFailureMode(id: string) {
    const existing = await db.failureMode.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('FailureMode', id);

    return db.failureMode.delete({ where: { id } });
  },

  // ── RCM ANALYSIS ─────────────────────────────────────────────────────────

  async listRcmAnalyses(params: ListRcmParams) {
    const timer = log.timer('listRcmAnalyses');
    const { assetId, status, page = 1, limit = 20 } = params;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { assetId };
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      db.rcmAnalysis.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: { select: { id: true, fullName: true, username: true } },
          approvedBy: { select: { id: true, fullName: true, username: true } },
          asset: { select: { id: true, name: true, assetTag: true } },
        },
      }),
      db.rcmAnalysis.count({ where }),
    ]);

    timer.end();
    return {
      items,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  },

  async createRcmAnalysis(data: CreateRcmAnalysisData) {
    const timer = log.timer('createRcmAnalysis');
    if (data.methodology && !VALID_RCM_METHODOLOGIES.includes(data.methodology)) {
      throw new ValidationError({ methodology: `Invalid methodology. Must be one of: ${VALID_RCM_METHODOLOGIES.join(', ')}` });
    }

    // Verify asset exists
    const asset = await db.asset.findUnique({ where: { id: data.assetId } });
    if (!asset) throw new NotFoundError('Asset', data.assetId);

    const analysis = await db.rcmAnalysis.create({
      data: {
        assetId: data.assetId,
        name: data.name,
        description: data.description,
        methodology: data.methodology || 'full',
        analysisDate: data.analysisDate ? new Date(data.analysisDate) : undefined,
        nextReviewDate: data.nextReviewDate ? new Date(data.nextReviewDate) : undefined,
        resultSummary: data.resultSummary,
        riskMatrix: data.riskMatrix,
        createdById: data.createdById,
      },
      include: {
        createdBy: { select: { id: true, fullName: true, username: true } },
        asset: { select: { id: true, name: true, assetTag: true } },
      },
    });

    timer.end();
    log.info('RCM analysis created', { id: analysis.id, assetId: data.assetId });
    return analysis;
  },

  async getRcmAnalysis(id: string) {
    const analysis = await db.rcmAnalysis.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, fullName: true, username: true } },
        approvedBy: { select: { id: true, fullName: true, username: true } },
        asset: { select: { id: true, name: true, assetTag: true, criticality: true } },
      },
    });

    if (!analysis) throw new NotFoundError('RcmAnalysis', id);
    return analysis;
  },

  async updateRcmAnalysis(id: string, data: Record<string, unknown>) {
    const existing = await db.rcmAnalysis.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('RcmAnalysis', id);

    if (data.methodology && !VALID_RCM_METHODOLOGIES.includes(data.methodology as string)) {
      throw new ValidationError({ methodology: `Invalid methodology. Must be one of: ${VALID_RCM_METHODOLOGIES.join(', ')}` });
    }
    if (data.status && !VALID_RCM_STATUSES.includes(data.status as string)) {
      throw new ValidationError({ status: `Invalid status. Must be one of: ${VALID_RCM_STATUSES.join(', ')}` });
    }

    const updateData = { ...data };
    if (updateData.analysisDate) updateData.analysisDate = new Date(updateData.analysisDate as string);
    if (updateData.nextReviewDate) updateData.nextReviewDate = new Date(updateData.nextReviewDate as string);
    if (updateData.approvedAt) updateData.approvedAt = new Date(updateData.approvedAt as string);
    delete updateData.createdById;
    delete updateData.assetId;

    return db.rcmAnalysis.update({
      where: { id },
      data: updateData,
      include: {
        createdBy: { select: { id: true, fullName: true, username: true } },
        approvedBy: { select: { id: true, fullName: true, username: true } },
        asset: { select: { id: true, name: true, assetTag: true } },
      },
    });
  },

  async deleteRcmAnalysis(id: string) {
    const existing = await db.rcmAnalysis.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('RcmAnalysis', id);

    return db.rcmAnalysis.delete({ where: { id } });
  },

  // ── WEIBULL ANALYSIS ──────────────────────────────────────────────────────

  async runWeibullAnalysis(componentId: string, analyzedById: string) {
    const timer = log.timer('runWeibullAnalysis');

    // Verify component exists
    const component = await db.componentRegistry.findUnique({
      where: { id: componentId },
      select: {
        id: true, name: true, componentCode: true,
        operatingHours: true, expectedLifeHours: true, healthScore: true,
        asset: { select: { id: true, name: true, assetTag: true } },
      },
    });
    if (!component) throw new NotFoundError('ComponentRegistry', componentId);

    // Fetch failure records for this component
    const failures = await db.failureRecord.findMany({
      where: { componentId },
      orderBy: { detectedAt: 'asc' },
      select: { detectedAt: true, resolvedAt: true, downtimeMinutes: true },
    });

    const analysisName = `Weibull Analysis - ${component.name} (${component.componentCode})`;

    // If insufficient data, create a record with null parameters
    if (failures.length < 3) {
      const saved = await db.weibullAnalysis.create({
        data: {
          componentId,
          name: analysisName,
          description: `Insufficient failure data (${failures.length} records). Minimum 3 required.`,
          shape: null,
          scale: null,
          location: null,
          confidence: null,
          sampleSize: 0,
          failureCount: failures.length,
          resultSummary: JSON.stringify({
            message: 'Insufficient failure data for Weibull analysis (minimum 3 failures required)',
            failureCount: failures.length,
          }),
          dataPoints: null,
          analyzedById,
        },
        include: {
          analyzedBy: { select: { id: true, fullName: true, username: true } },
          component: { select: { id: true, name: true, componentCode: true } },
        },
      });

      timer.end();
      return saved;
    }

    // Calculate time between failures (hours)
    const tbf: number[] = [];
    for (let i = 1; i < failures.length; i++) {
      const diff =
        new Date(failures[i].detectedAt).getTime() -
        new Date(failures[i - 1].detectedAt).getTime();
      if (diff > 0) tbf.push(diff / (1000 * 60 * 60));
    }

    let shape: number | null = null;
    let scale: number | null = null;
    let b10Life: number | null = null;
    let meanLife: number | null = null;
    let mtbf: number | null = null;
    let reliabilityAtIntervals: Array<{ hours: number; reliability: number }> | null = null;

    if (tbf.length >= 2) {
      // ── Median Rank Regression (Benard's approximation) ─────────────────
      const sortedTbf = [...tbf].sort((a, b) => a - b);
      const n = sortedTbf.length;

      // Median ranks
      const ranks = sortedTbf.map((_, i) => (i + 1 - 0.3) / (n + 0.4));

      // Log transforms for linear regression
      const logT = sortedTbf.map((t) => Math.log(t));
      const logLogRanks = ranks.map((r) =>
        Math.log(Math.log(1 / (1 - Math.min(r, 0.999))))
      );

      // Linear regression: ln(ln(1/(1-F))) = beta * ln(t) - beta * ln(eta)
      const nPts = logT.length;
      const sumX = logT.reduce((s, x) => s + x, 0);
      const sumY = logLogRanks.reduce((s, y) => s + y, 0);
      const sumXY = logT.reduce((s, x, i) => s + x * logLogRanks[i], 0);
      const sumX2 = logT.reduce((s, x) => s + x * x, 0);

      const beta = (nPts * sumXY - sumX * sumY) / (nPts * sumX2 - sumX * sumX);
      shape = Math.max(0.5, Math.min(5, beta));

      // Scale (eta) — characteristic life
      const lnEta = (sumX * sumY - nPts * sumXY) / (nPts * sumX2 - sumX * sumX);
      scale = Math.exp(Math.abs(lnEta));

      // B10 life
      b10Life = scale * Math.pow(-Math.log(0.9), 1 / shape);

      // Mean life
      meanLife = scale * gammaApprox(1 + 1 / shape);

      // MTBF from first to last failure
      const firstDate = failures[0].detectedAt;
      const lastDate = failures[failures.length - 1].detectedAt;
      const totalHours = (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60);
      mtbf = totalHours / (failures.length - 1);

      // Reliability at intervals
      const fittedScale = scale;
      const fittedShape = shape;
      reliabilityAtIntervals = [100, 500, 1000, 2000, 5000, 10000].map(
        (hours) => ({
          hours,
          reliability: Math.round(
            Math.exp(-Math.pow(hours / fittedScale, fittedShape)) * 10000
          ) / 100,
        })
      );
    }

    // Determine interpretation
    const interpretation =
      shape === null ? null
      : shape < 1 ? 'Infant Mortality Pattern'
      : shape < 1.5 ? 'Random Failures'
      : shape < 2.5 ? 'Moderate Wear-out'
      : 'Significant Wear-out';

    const resultSummary = JSON.stringify({
      shape, scale, b10Life, meanLife, mtbf,
      reliabilityAtIntervals,
      interpretation,
      failureCount: failures.length,
      dataPoints: tbf.length,
    }, null, 2);

    // Determine time range from data
    const timeRange = JSON.stringify({
      start: failures[0].detectedAt.toISOString(),
      end: failures[failures.length - 1].detectedAt.toISOString(),
      unit: 'hours',
    });

    // Confidence based on sample size
    const confidence = Math.min(0.99, tbf.length / 20);

    const saved = await db.weibullAnalysis.create({
      data: {
        componentId,
        name: analysisName,
        description: `Weibull life data analysis for ${component.name}`,
        shape: shape ?? undefined,
        scale: scale ?? undefined,
        location: 0,
        confidence,
        sampleSize: tbf.length,
        failureCount: failures.length,
        timeRange,
        resultSummary,
        dataPoints: JSON.stringify(tbf),
        analyzedById,
      },
      include: {
        analyzedBy: { select: { id: true, fullName: true, username: true } },
        component: { select: { id: true, name: true, componentCode: true } },
      },
    });

    timer.end();
    log.info('Weibull analysis computed', {
      componentId, shape: shape?.toFixed(3), scale: scale?.toFixed(1),
      failures: failures.length,
    });
    return saved;
  },

  async listWeibullAnalyses(componentId: string) {
    const timer = log.timer('listWeibullAnalyses');

    const analyses = await db.weibullAnalysis.findMany({
      where: { componentId },
      orderBy: { analyzedAt: 'desc' },
      include: {
        analyzedBy: { select: { id: true, fullName: true, username: true } },
        component: { select: { id: true, name: true, componentCode: true } },
      },
    });

    timer.end();
    return analyses;
  },

  async getWeibullAnalysis(id: string) {
    const analysis = await db.weibullAnalysis.findUnique({
      where: { id },
      include: {
        analyzedBy: { select: { id: true, fullName: true, username: true } },
        component: { select: { id: true, name: true, componentCode: true } },
      },
    });

    if (!analysis) throw new NotFoundError('WeibullAnalysis', id);
    return analysis;
  },

  // ── DOWNTIME ANALYSIS ────────────────────────────────────────────────────

  async computeDowntimeAnalysis(
    assetId: string,
    periodStart: Date,
    periodEnd: Date,
    createdById: string
  ) {
    const timer = log.timer('computeDowntimeAnalysis');

    // Verify asset exists
    const asset = await db.asset.findUnique({
      where: { id: assetId },
      select: { id: true, name: true, assetTag: true },
    });
    if (!asset) throw new NotFoundError('Asset', assetId);

    // Get failure records within the period
    const failures = await db.failureRecord.findMany({
      where: {
        assetId,
        detectedAt: { gte: periodStart, lte: periodEnd },
      },
      orderBy: { detectedAt: 'asc' },
      select: {
        detectedAt: true,
        resolvedAt: true,
        downtimeMinutes: true,
        repairCost: true,
        failureMode: true,
      },
    });

    // Get work orders within the period for planned downtime
    const plannedWorkOrders = await db.workOrder.findMany({
      where: {
        assetId,
        type: 'preventive',
        actualStart: { gte: periodStart, lte: periodEnd },
        actualEnd: { not: null },
      },
      select: {
        actualStart: true,
        actualEnd: true,
        actualHours: true,
      },
    });

    const plannedDowntime = plannedWorkOrders.reduce((sum, wo) => {
      return sum + (wo.actualHours ?? 0);
    }, 0);

    const totalDowntimeMinutes = failures.reduce((sum, f) => sum + f.downtimeMinutes, 0);
    const totalDowntime = totalDowntimeMinutes / 60;
    const unplannedDowntime = totalDowntime - plannedDowntime;
    const downtimeCost = failures.reduce((sum, f) => sum + (f.repairCost ?? 0), 0);

    // Compute MTBF
    let mtbf: number | null = null;
    const resolved = failures.filter((f) => f.resolvedAt);
    if (resolved.length >= 2) {
      const sorted = resolved
        .filter((f) => f.detectedAt)
        .map((f) => f.detectedAt!.getTime())
        .sort((a, b) => a - b);
      if (sorted.length >= 2) {
        let totalHoursBetween = 0;
        for (let i = 1; i < sorted.length; i++) {
          totalHoursBetween += (sorted[i] - sorted[i - 1]) / (1000 * 60 * 60);
        }
        mtbf = totalHoursBetween / (sorted.length - 1);
      }
    }

    // Compute MTTR
    let mttr: number | null = null;
    if (resolved.length > 0) {
      const totalRepairMs = resolved.reduce(
        (sum, f) =>
          sum + (new Date(f.resolvedAt!).getTime() - new Date(f.detectedAt).getTime()),
        0
      );
      mttr = totalRepairMs / (1000 * 60 * 60) / resolved.length;
    }

    // Compute availability and reliability
    const periodHours = (periodEnd.getTime() - periodStart.getTime()) / (1000 * 60 * 60);
    const availability = periodHours > 0
      ? Math.round(((periodHours - totalDowntime) / periodHours) * 10000) / 100
      : null;

    const reliability = mtbf && periodHours > 0
      ? Math.round(Math.exp(-periodHours / mtbf) * 10000) / 100
      : null;

    // Severity breakdown
    const severityBreakdown: Record<string, { count: number; downtime: number }> = {};
    for (const f of failures) {
      // Use failureMode's severity if available, otherwise default
      const sev = 'unknown';
      if (!severityBreakdown[sev]) severityBreakdown[sev] = { count: 0, downtime: 0 };
      severityBreakdown[sev].count += 1;
      severityBreakdown[sev].downtime += f.downtimeMinutes / 60;
    }

    const analysis = await db.downtimeAnalysis.create({
      data: {
        assetId,
        periodStart,
        periodEnd,
        totalDowntime: Math.round(totalDowntime * 100) / 100,
        plannedDowntime: Math.round(plannedDowntime * 100) / 100,
        unplannedDowntime: Math.round(Math.max(0, unplannedDowntime) * 100) / 100,
        downtimeCost: Math.round(downtimeCost * 100) / 100,
        mtbf: mtbf ? Math.round(mtbf * 100) / 100 : null,
        mttr: mttr ? Math.round(mttr * 100) / 100 : null,
        availability,
        reliability,
        createdById,
      },
      include: {
        asset: { select: { id: true, name: true, assetTag: true } },
        createdBy: { select: { id: true, fullName: true, username: true } },
      },
    });

    timer.end();
    log.info('Downtime analysis computed', {
      assetId, totalDowntime: totalDowntime.toFixed(1), failures: failures.length,
    });
    return analysis;
  },

  async listDowntimeAnalyses(assetId: string) {
    const timer = log.timer('listDowntimeAnalyses');

    const analyses = await db.downtimeAnalysis.findMany({
      where: { assetId },
      orderBy: { periodStart: 'desc' },
      include: {
        asset: { select: { id: true, name: true, assetTag: true } },
        createdBy: { select: { id: true, fullName: true, username: true } },
      },
    });

    timer.end();
    return analyses;
  },

  // ── REMAINING USEFUL LIFE ─────────────────────────────────────────────────

  async computeRemainingUsefulLife(componentId: string, analyzedById: string) {
    const timer = log.timer('computeRemainingUsefulLife');

    // Verify component exists
    const component = await db.componentRegistry.findUnique({
      where: { id: componentId },
      select: {
        id: true, name: true, componentCode: true,
        healthScore: true, operatingHours: true, expectedLifeHours: true,
        installedDate: true, lifecycleStatus: true,
        asset: { select: { id: true, name: true } },
      },
    });
    if (!component) throw new NotFoundError('ComponentRegistry', componentId);

    const currentHealth = component.healthScore ?? 100;

    // Fetch failure history for degradation rate estimation
    const failures = await db.failureRecord.findMany({
      where: { componentId },
      orderBy: { detectedAt: 'asc' },
      select: { detectedAt: true, downtimeMinutes: true },
    });

    // Fetch condition readings for trend analysis
    const conditionReadings = await db.componentConditionReading.findMany({
      where: { componentId },
      orderBy: { recordedAt: 'desc' },
      take: 20,
      select: { recordedAt: true, value: true, parameterKey: true, unit: true, minThreshold: true, maxThreshold: true },
    });

    let degradationRate = 0;
    let confidenceScore = 0.3; // Low confidence with no data

    // Method 1: Estimate from operating hours vs expected life
    if (component.expectedLifeHours && component.expectedLifeHours > 0 && component.operatingHours > 0) {
      const lifeConsumed = component.operatingHours / component.expectedLifeHours;
      const healthFromLife = Math.max(0, (1 - lifeConsumed) * 100);

      if (component.installedDate) {
        const daysSinceInstall = (Date.now() - component.installedDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceInstall > 0) {
          degradationRate = (100 - healthFromLife) / daysSinceInstall;
        }
      }
    }

    // Method 2: Estimate from failure frequency
    if (failures.length >= 2 && component.installedDate) {
      const firstFailure = failures[0].detectedAt;
      const lastFailure = failures[failures.length - 1].detectedAt;
      const daysSpan = (lastFailure.getTime() - firstFailure.getTime()) / (1000 * 60 * 60 * 24);

      if (daysSpan > 30) {
        const failureRate = failures.length / (daysSpan / 365); // failures per year
        // Each failure roughly degrades health by 5-15 points
        const healthImpactPerDay = (failureRate * 10) / 365;
        degradationRate = Math.max(degradationRate, healthImpactPerDay);
        confidenceScore = Math.min(0.9, confidenceScore + 0.3);
      }
    }

    // Method 3: Compare like-for-like measurements only. Raw temperature,
    // vibration and pressure cannot be averaged into a health-point trend.
    // Use excursions normalized against a recorded two-sided operating band.
    const groups = new Map<string, typeof conditionReadings>();
    for (const reading of conditionReadings) {
      const { minThreshold: min, maxThreshold: max } = reading;
      if (min == null || max == null || !Number.isFinite(min) || !Number.isFinite(max) || max <= min || !Number.isFinite(reading.value)) continue;
      const key = JSON.stringify([reading.parameterKey, reading.unit, min, max]);
      const group = groups.get(key) ?? [];
      group.push(reading);
      groups.set(key, group);
    }
    let observedTrend = 0;
    for (const group of groups.values()) {
      if (group.length < 3) continue;
      const recent = group.slice(0, 10);
      const excursion = (reading: typeof recent[number]) => {
        const min = reading.minThreshold!;
        const max = reading.maxThreshold!;
        return Math.max(0, min - reading.value, reading.value - max) / (max - min);
      };
      const newest = recent[0];
      const oldest = recent[recent.length - 1];
      const days = (newest.recordedAt.getTime() - oldest.recordedAt.getTime()) / 86400000;
      if (days <= 0) continue;
      observedTrend = Math.max(observedTrend, (excursion(newest) - excursion(oldest)) * 100 / days);
    }
    if (observedTrend > 0) {
      degradationRate = Math.max(degradationRate, observedTrend * 0.5);
      confidenceScore = Math.min(0.7, confidenceScore + 0.15);
    }

    // Default degradation rate if no data
    if (degradationRate === 0) {
      degradationRate = 0.1; // Default: 0.1 health points per day
      confidenceScore = 0.2;
    }

    // Estimate RUL in days
    const estimatedRul = degradationRate > 0
      ? Math.round(currentHealth / degradationRate)
      : null;

    // Upsert (use the unique constraint on componentId)
    const rul = await db.remainingUsefulLife.upsert({
      where: { componentId },
      update: {
        currentHealth,
        degradationRate: Math.round(degradationRate * 1000) / 1000,
        estimatedRul,
        confidenceScore: Math.round(confidenceScore * 1000) / 1000,
        lastUpdated: new Date(),
        analyzedById,
      },
      create: {
        componentId,
        currentHealth,
        degradationRate: Math.round(degradationRate * 1000) / 1000,
        estimatedRul,
        confidenceScore: Math.round(confidenceScore * 1000) / 1000,
        analyzedById,
      },
      include: {
        component: { select: { id: true, name: true, componentCode: true } },
        analyzedBy: { select: { id: true, fullName: true, username: true } },
      },
    });

    timer.end();
    log.info('RUL computed', {
      componentId, currentHealth, degradationRate: degradationRate.toFixed(4),
      estimatedRul, confidenceScore: confidenceScore.toFixed(2),
    });
    return rul;
  },

  async getRemainingUsefulLife(componentId: string) {
    const rul = await db.remainingUsefulLife.findUnique({
      where: { componentId },
      include: {
        component: {
          select: {
            id: true, name: true, componentCode: true,
            healthScore: true, operatingHours: true, expectedLifeHours: true,
            lifecycleStatus: true,
          },
        },
        analyzedBy: { select: { id: true, fullName: true, username: true } },
      },
    });

    return rul; // Returns null if no RUL estimate exists
  },

  // ── ASSET CRITICALITY RANKING ─────────────────────────────────────────────

  async getAssetCriticalityRanking(plantId?: string, permittedPlantFilter: Record<string, unknown> = {}) {
    const timer = log.timer('getAssetCriticalityRanking');

    const where: Record<string, unknown> = { isActive: true, ...permittedPlantFilter };
    if (plantId) where.plantId = plantId;

    const assets = await db.asset.findMany({
      where,
      select: {
        id: true, name: true, assetTag: true, criticality: true,
        status: true, condition: true, plantId: true,
        _count: {
          select: {
            failureRecords: true,
            predictiveModels: true,
            iotDevices: true,
          },
        },
      },
    });

    if (assets.length === 0) {
      timer.end();
      return { rankings: [], summary: { total: 0, byCriticality: {} } };
    }

    const criticalityWeights: Record<string, number> = {
      critical: 90,
      high: 60,
      medium: 30,
      low: 10,
    };

    const rankings = await Promise.all(
      assets.map(async (asset) => {
        let score = 0;

        // Factor 1: Inherent criticality (0-35 pts)
        score += criticalityWeights[asset.criticality] || 30;

        // Factor 2: Health score inverse (0-25 pts)
        // No measured health score exists on Asset; expose an explicit condition-derived proxy.
        const healthByCondition: Record<string, number> = { new: 100, good: 85, fair: 60, poor: 30, out_of_service: 0 };
        const healthScore = healthByCondition[asset.condition] ?? 50;
        score += Math.round((100 - healthScore) * 0.25);

        // Factor 3: Failure frequency — weighted by recency (0-20 pts)
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        const recentFailures = await db.failureRecord.count({
          where: { assetId: asset.id, detectedAt: { gte: ninetyDaysAgo } },
        });
        score += Math.min(20, recentFailures * 5);

        // Factor 4: Open work orders (0-10 pts)
        const totalWorkOrders = await db.workOrder.count({ where: { assetId: asset.id, plantId: asset.plantId } });
        const openWOs = await db.workOrder.count({
          where: {
            assetId: asset.id,
            plantId: asset.plantId,
            status: { in: ['open', 'in_progress', 'assigned', 'waiting_parts'] },
          },
        });
        score += Math.min(10, openWOs * 2);

        // Factor 5: IoT alert activity (0-10 pts)
        const activeAlerts = asset._count.iotDevices > 0
          ? await db.iotAlert.count({
              where: {
                device: { assetId: asset.id },
                status: { in: ['active', 'acknowledged'] },
              },
            })
          : 0;
        score += Math.min(10, activeAlerts * 2);

        score = Math.min(100, score);

        const criticalityLevel =
          score >= 80 ? 'critical'
          : score >= 60 ? 'high'
          : score >= 40 ? 'medium'
          : 'low';

        return {
          assetId: asset.id,
          assetName: asset.name,
          assetTag: asset.assetTag,
          criticality: asset.criticality,
          healthScore,
          status: asset.status,
          totalFailures: asset._count.failureRecords,
          totalWorkOrders,
          healthScoreSource: 'condition_estimate',
          openWorkOrders: openWOs,
          recentFailures,
          activeAlerts,
          criticalityScore: score,
          criticalityLevel,
          hasPredictiveModels: asset._count.predictiveModels > 0,
        };
      })
    );

    // Sort by score descending
    rankings.sort((a, b) => b.criticalityScore - a.criticalityScore);

    // Summary by criticality level
    const byCriticality: Record<string, number> = {
      critical: 0, high: 0, medium: 0, low: 0,
    };
    for (const r of rankings) {
      byCriticality[r.criticalityLevel] = (byCriticality[r.criticalityLevel] || 0) + 1;
    }

    timer.end();
    return {
      rankings,
      summary: {
        total: rankings.length,
        byCriticality,
        avgScore: rankings.length > 0
          ? Math.round(rankings.reduce((s, r) => s + r.criticalityScore, 0) / rankings.length)
          : 0,
      },
    };
  },
};
