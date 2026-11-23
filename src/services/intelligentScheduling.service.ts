// ============================================================================
// INTELLIGENT SCHEDULING — AI-assisted PM optimization and workforce planning
// ============================================================================

import { db } from '@/lib/db';
import { createLogger } from '@/lib/logger';

const logger = createLogger('intelligentScheduling');

export interface ScheduleRecommendation {
  workOrderId: string;
  workOrderTitle: string;
  assetId: string;
  assetName: string;
  recommendedDate: string;
  priority: number; // 1-10
  reasoning: string;
  estimatedDuration: number;
  requiredSkills: string[];
  conflictWith?: string[];
}

export interface ScheduleOptimization {
  totalWorkOrders: number;
  scheduledCount: number;
  unscheduledCount: number;
  resourceConflicts: Array<{ wo1: string; wo2: string; conflict: string }>;
  recommendations: ScheduleRecommendation[];
  workforceUtilization: number;
  period: { start: string; end: string };
}

export class IntelligentSchedulingService {
  /**
   * Generate PM schedule optimization recommendations
   */
  static async optimizeSchedule(plantId?: string, daysAhead: number = 14): Promise<ScheduleOptimization> {
    const startDate = new Date();
    const endDate = new Date(Date.now() + daysAhead * 86400000);

    try {
      // Get open/pending work orders
      const workOrders = await db.workOrder.findMany({
        where: {
          ...(plantId ? { plantId } : {}),
          status: { in: ['approved', 'planned', 'assigned'] },
        },
        orderBy: { priority: 'asc' },
        take: 100,
      });

      // WorkOrder stores assetId as an external reference, not a Prisma
      // asset relation. Resolve actual assets explicitly, within plant scope,
      // instead of using an invalid include and silently losing priority data.
      const relatedAssetIds = [...new Set(workOrders
        .map(wo => wo.assetId)
        .filter((id): id is string => Boolean(id)))];
      const relatedAssets = relatedAssetIds.length
        ? await db.asset.findMany({
            where: { id: { in: relatedAssetIds }, ...(plantId ? {plantId} : {}) },
            select: { id: true, name: true, condition: true, criticality: true },
          })
        : [];
      const assetsById = new Map(relatedAssets.map(asset => [asset.id, asset]));

      // Get technician availability
      const technicians = await db.user.findMany({
        where: { status: 'active' },
        select: { id: true, fullName: true },
        take: 50,
      });

      const recommendations: ScheduleRecommendation[] = [];
      const conflicts: ScheduleOptimization['resourceConflicts'] = [];

      for (const wo of workOrders) {
        const asset = wo.assetId ? assetsById.get(wo.assetId) || null : null;
        const priority = this.calculatePriority(wo, asset);
        const recommendedDate = this.calculateOptimalDate(wo, startDate, endDate, recommendations);
        const duration = wo.estimatedHours || 4;
        const reasoning = this.generateReasoning(wo, asset, priority, recommendedDate);

        // Check for conflicts with already recommended items
        const conflictWith = recommendations
          .filter(r => {
            const rDate = new Date(r.recommendedDate);
            const wDate = new Date(recommendedDate);
            return Math.abs(rDate.getTime() - wDate.getTime()) < duration * 3600000 && r.assetId === wo.assetId;
          })
          .map(r => r.workOrderId);

        if (conflictWith.length > 0) {
          conflicts.push({ wo1: wo.id, wo2: conflictWith[0], conflict: 'Same asset, overlapping time' });
        }

        recommendations.push({
          workOrderId: wo.id,
          workOrderTitle: wo.title,
          assetId: wo.assetId || '',
          assetName: asset?.name || wo.assetName || 'Unknown',
          recommendedDate: recommendedDate.toISOString(),
          priority,
          reasoning,
          estimatedDuration: duration,
          requiredSkills: this.inferRequiredSkills(wo),
          conflictWith: conflictWith.length > 0 ? conflictWith : undefined,
        });
      }

      // Sort by priority (highest first)
      recommendations.sort((a, b) => b.priority - a.priority);

      // Calculate workforce utilization
      const totalAvailableHours = technicians.length * 8 * daysAhead;
      const totalRequiredHours = workOrders.reduce((s, wo) => s + (wo.estimatedHours || 4), 0);
      const utilization = totalAvailableHours > 0 ? Math.min(100, Math.round((totalRequiredHours / totalAvailableHours) * 100)) : 0;

      return {
        totalWorkOrders: workOrders.length,
        scheduledCount: recommendations.length,
        unscheduledCount: Math.max(0, workOrders.length - recommendations.length),
        resourceConflicts: conflicts,
        recommendations,
        workforceUtilization: utilization,
        period: { start: startDate.toISOString(), end: endDate.toISOString() },
      };
    } catch (error) {
      logger.error('Schedule optimization failed', error);
      return {
        totalWorkOrders: 0, scheduledCount: 0, unscheduledCount: 0,
        resourceConflicts: [], recommendations: [], workforceUtilization: 0,
        period: { start: startDate.toISOString(), end: endDate.toISOString() },
      };
    }
  }

  /**
   * Calculate work order priority score (1-10)
   */
  private static calculatePriority(
    wo: { priority: string | null; createdAt: Date; estimatedHours: number | null },
    asset: { condition: string | null; criticality: string | null } | null
  ): number {
    let score = 5; // base

    // Criticality bonus
    if (asset?.criticality === 'critical') score += 3;
    else if (asset?.criticality === 'high') score += 2;
    else if (asset?.criticality === 'medium') score += 1;

    // Condition urgency
    if (asset?.condition === 'critical') score += 3;
    else if (asset?.condition === 'poor') score += 2;
    else if (asset?.condition === 'fair') score += 1;

    // Priority field
    if (wo.priority === 'emergency') score += 4;
    else if (wo.priority === 'critical') score += 3;
    else if (wo.priority === 'high') score += 2;
    else if (wo.priority === 'medium') score += 1;

    // Age penalty (older WOs get higher priority)
    const ageDays = (Date.now() - wo.createdAt.getTime()) / 86400000;
    if (ageDays > 30) score += 1;
    if (ageDays > 60) score += 1;

    return Math.min(10, Math.max(1, score));
  }

  /**
   * Calculate optimal scheduling date
   */
  private static calculateOptimalDate(
    wo: { plannedStart?: Date | null; plannedEnd?: Date | null },
    startDate: Date,
    endDate: Date,
    existing: ScheduleRecommendation[]
  ): Date {
    // If there's a planned end date, schedule before it
    if (wo.plannedEnd) {
      const plannedEnd = new Date(wo.plannedEnd);
      if (plannedEnd > startDate && plannedEnd < endDate) {
        return plannedEnd;
      }
    }

    // If there's a planned start, use it
    if (wo.plannedStart) {
      const plannedStart = new Date(wo.plannedStart);
      if (plannedStart >= startDate && plannedStart <= endDate) {
        return plannedStart;
      }
    }

    // Find next available slot (simple: start from start date, skip conflicts)
    const candidate = new Date(startDate);
    const maxAttempts = 14;

    for (let i = 0; i < maxAttempts; i++) {
      const dayOfWeek = candidate.getDay();
      // Skip weekends
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        candidate.setDate(candidate.getDate() + 1);
        continue;
      }

      // Check if this date conflicts with high-priority items
      const dateStr = candidate.toISOString().split('T')[0];
      const dayLoad = existing.filter(r => r.recommendedDate.startsWith(dateStr)).length;

      if (dayLoad < 4) { // Max 4 WOs per day
        return candidate;
      }

      candidate.setDate(candidate.getDate() + 1);
    }

    return candidate;
  }

  /**
   * Generate scheduling reasoning
   */
  private static generateReasoning(
    wo: Record<string, unknown>,
    asset: { condition: string | null; criticality: string | null; name: string | null } | null,
    priority: number,
    date: Date
  ): string {
    const parts: string[] = [];

    if (priority >= 8) parts.push('High priority — schedule as soon as resources allow.');
    else if (priority >= 5) parts.push('Medium priority — schedule within normal planning window.');

    if (asset?.condition === 'critical' || asset?.condition === 'poor') {
      parts.push(`Asset condition is ${asset.condition} — expedite scheduling.`);
    }

    if (asset?.criticality === 'critical') {
      parts.push('Critical asset — ensure qualified personnel assigned.');
    }

    parts.push(`Recommended date: ${date.toLocaleDateString()}.`);

    return parts.join(' ');
  }

  /**
   * Infer required skills from work order data
   */
  private static inferRequiredSkills(wo: Record<string, unknown>): string[] {
    const skills: string[] = [];
    const title = (wo.title as string || '').toLowerCase();

    if (title.includes('electrical') || title.includes('motor') || title.includes('panel')) {
      skills.push('Electrical', 'HV Switching');
    }
    if (title.includes('weld') || title.includes('pipe') || title.includes('valve')) {
      skills.push('Mechanical', 'Welding');
    }
    if (title.includes('instrument') || title.includes('calibrat') || title.includes('sensor')) {
      skills.push('Instrumentation', 'Calibration');
    }
    if (title.includes('safety') || title.includes('loto') || title.includes('confined')) {
      skills.push('Safety', 'LOTO Certified');
    }

    if (skills.length === 0) skills.push('General Maintenance');
    return skills;
  }
}
