import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope, type PlantScopeResult } from '@/lib/plant-scope';
import { notifyUser } from '@/lib/notifications';
import { POST as generateDueWorkOrders } from '../check-due/route';
import { POST as evaluateRuntimeTriggers } from '../../pm-triggers/evaluate/route';

/**
 * POST /api/pm-schedules/check-due-cron
 *
 * Runs the canonical, atomic PM due-generation endpoint and then performs the
 * additional overdue-without-open-WO notification scan. This route deliberately
 * does not maintain a second work-order generator: all WO creation, component
 * linkage, numbering, idempotency, audit and automation-actor behavior lives in
 * check-due/route.ts.
 *
 * Auth:
 * - a valid X-PM-Cron-Secret is trusted system automation and may run system-wide;
 * - a manual caller must be authenticated and hold pm_schedules.run (or admin),
 *   and the overdue scan is restricted to that caller's plant scope.
 */

const CRON_SECRET = process.env.PM_CRON_SECRET || '';
const DENY_ACCESS_SENTINEL = '__ACCESS_DENIED__';

type GenerationResult = {
  scheduleId: string;
  scheduleTitle: string;
  workOrderId: string;
  woNumber: string;
  skipped: boolean;
  reason?: string;
};

type GenerationPayload = {
  success: boolean;
  error?: string;
  data?: {
    checked: number;
    generated: number;
    skipped: number;
    results: GenerationResult[];
  };
};

type TriggerEvaluationPayload = {
  success: boolean;
  error?: string;
  data?: {
    evaluated: number;
    generated: number;
    results: unknown[];
    engines: unknown;
  };
};

function manualAssetPlantFilter(plantScope: PlantScopeResult | null) {
  if (!plantScope || plantScope.isSystemWide) return {};
  if (plantScope.isScoped && plantScope.plantId) return { plantId: plantScope.plantId };
  return {
    plantId: {
      in: plantScope.accessiblePlantIds.length > 0
        ? plantScope.accessiblePlantIds
        : [DENY_ACCESS_SENTINEL],
    },
  };
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    const cronSecret = request.headers.get('x-pm-cron-secret');
    const hasValidCronSecret = Boolean(CRON_SECRET && cronSecret === CRON_SECRET);

    let plantScope: PlantScopeResult | null = null;
    if (!hasValidCronSecret) {
      if (!session) {
        return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
      }
      if (!hasPermission(session, 'pm_schedules.run') && !isAdmin(session)) {
        return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
      }

      plantScope = await getPlantScope(request, session);
      if (plantScope.denyAccess) {
        return NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 });
      }
    }

    // Phase 1: delegate every mutation to the canonical atomic/idempotent path.
    const generationResponse = await generateDueWorkOrders(request);
    const generationPayload = await generationResponse.json() as GenerationPayload;
    if (!generationResponse.ok || !generationPayload.success || !generationPayload.data) {
      return NextResponse.json(
        generationPayload,
        { status: generationResponse.status || 500 },
      );
    }

    // Phase 2: run meter, condition and production-count PM triggers through
    // their canonical evaluator. Keeping this inside the same cron entrypoint
    // guarantees that installing one scheduler activates every PM automation
    // mode instead of leaving runtime triggers dependent on a separate job.
    const triggerResponse = await evaluateRuntimeTriggers(request);
    const triggerPayload = await triggerResponse.json() as TriggerEvaluationPayload;
    if (!triggerResponse.ok || !triggerPayload.success || !triggerPayload.data) {
      return NextResponse.json(
        {
          success: false,
          error: triggerPayload.error || 'PM runtime trigger evaluation failed',
          data: {
            calendarGeneration: generationPayload.data,
          },
        },
        { status: triggerResponse.status || 500 },
      );
    }

    const now = new Date();
    const generatedDetails = generationPayload.data.results
      .filter((result) => !result.skipped)
      .map((result) => ({
        scheduleId: result.scheduleId,
        scheduleTitle: result.scheduleTitle,
        workOrderId: result.workOrderId,
        woNumber: result.woNumber,
      }));

    const results = {
      dueSchedulesChecked: generationPayload.data.checked,
      workOrdersGenerated: generationPayload.data.generated,
      skipped: generationPayload.data.skipped,
      overdueSchedulesFound: 0,
      overdueAlertsSent: 0,
      generatedDetails,
      runtimeTriggers: triggerPayload.data,
      overdueDetails: [] as Array<{
        scheduleId: string;
        scheduleTitle: string;
        nextDueDate: string;
        daysOverdue: number;
        assetName: string;
      }>,
    };

    // Phase 3: identify overdue schedules that still have no open preventive WO.
    // Manual runs use the exact same plant boundary as check-due; trusted cron is
    // intentionally system-wide.
    const overdueSchedules = await db.pmSchedule.findMany({
      where: {
        isActive: true,
        frequencyType: { notIn: ['meter_based', 'custom_hours'] },
        nextDueDate: { not: null, lt: now },
        asset: manualAssetPlantFilter(plantScope),
      },
      include: {
        asset: {
          select: { id: true, name: true, assetTag: true, plantId: true },
        },
        assignedTo: { select: { id: true, fullName: true, username: true } },
      },
    });

    for (const schedule of overdueSchedules) {
      const nextDueDate = new Date(schedule.nextDueDate!);
      const daysOverdue = Math.floor((now.getTime() - nextDueDate.getTime()) / 86400000);

      const openWo = await db.workOrder.findFirst({
        where: {
          pmScheduleId: schedule.id,
          type: 'preventive',
          status: {
            in: ['draft', 'requested', 'approved', 'planned', 'assigned', 'in_progress', 'waiting_parts', 'on_hold'],
          },
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (openWo) continue;

      results.overdueSchedulesFound++;
      results.overdueDetails.push({
        scheduleId: schedule.id,
        scheduleTitle: schedule.title,
        nextDueDate: nextDueDate.toISOString(),
        daysOverdue,
        assetName: schedule.asset.name,
      });

      const notifyTargetId = schedule.assignedToId || (!hasValidCronSecret ? session?.userId : undefined);
      if (!notifyTargetId) continue;

      // This route is intended to run frequently enough for condition/meter
      // triggers to feel responsive. Do not turn that cadence into alert spam:
      // send at most one overdue alert per schedule/recipient in a rolling day.
      const recentOverdueAlert = await db.notification.findFirst({
        where: {
          userId: notifyTargetId,
          type: 'pm_overdue',
          entityType: 'pm_schedule',
          entityId: schedule.id,
          createdAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
        },
        select: { id: true },
      });
      if (recentOverdueAlert) continue;

      try {
        await notifyUser(
          notifyTargetId,
          'pm_overdue',
          'PM Schedule Overdue',
          `PM schedule "${schedule.title}" for asset ${schedule.asset.name} is ${daysOverdue} day(s) overdue (was due ${nextDueDate.toLocaleDateString()}). No open work order exists.`,
          'pm_schedule',
          schedule.id,
          'pm-schedules',
        );
        results.overdueAlertsSent++;
      } catch (notificationError) {
        // Notification delivery is secondary to the already-completed generation
        // and overdue scan. Do not make cron retries look like generation failures.
        console.error('[PM Overdue Notification Error]', notificationError);
      }
    }

    return NextResponse.json({
      success: true,
      data: results,
      timestamp: now.toISOString(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to run PM cron check';
    console.error('[PM Check-Due-Cron Error]', message, error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
