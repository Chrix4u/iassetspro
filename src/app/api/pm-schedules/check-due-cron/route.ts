import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { calculateNextDueDate, isAutoCalculableFrequency } from '@/lib/pm-utils';
import { notifyUser } from '@/lib/notifications';

/**
 * POST /api/pm-schedules/check-due-cron
 *
 * Extended version of check-due that also:
 * 1. Generates WOs for due schedules (same as check-due)
 * 2. Detects overdue PM schedules (nextDueDate < now AND no open WO)
 * 3. Sends notifications for overdue PMs
 * 4. Returns a comprehensive summary of all actions taken
 *
 * Auth: Requires session OR internal secret header (same as check-due).
 */

// Internal cron secret
const CRON_SECRET = process.env.PM_CRON_SECRET || 'pm-scheduler-internal-2025';

// Helper: generate WO number WO-YYYYMM-NNNN
async function generateWoNumber(): Promise<string> {
  const now = new Date();
  const prefix = `WO-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;

  const latest = await db.workOrder.findFirst({
    where: { woNumber: { startsWith: prefix } },
    orderBy: { woNumber: 'desc' },
    select: { woNumber: true },
  });

  let nextNum = 1;
  if (latest) {
    const parts = latest.woNumber.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    nextNum = lastNum + 1;
  }

  return `${prefix}-${String(nextNum).padStart(4, '0')}`;
}

export async function POST(request: NextRequest) {
  try {
    // Auth: either session or internal cron secret
    const session = getSession(request);
    const cronSecret = request.headers.get('x-pm-cron-secret');

    if (!session && cronSecret !== CRON_SECRET) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const now = new Date();
    const results = {
      dueSchedulesChecked: 0,
      workOrdersGenerated: 0,
      skipped: 0,
      overdueSchedulesFound: 0,
      overdueAlertsSent: 0,
      generatedDetails: [] as Array<{
        scheduleId: string;
        scheduleTitle: string;
        workOrderId: string;
        woNumber: string;
      }>,
      overdueDetails: [] as Array<{
        scheduleId: string;
        scheduleTitle: string;
        nextDueDate: string;
        daysOverdue: number;
        assetName: string;
      }>,
    };

    // ── PHASE 1: Generate WOs for due schedules (same logic as check-due) ──
    const dueSchedules = await db.pmSchedule.findMany({
      where: {
        isActive: true,
        autoGenerateWO: true,
        nextDueDate: { not: null },
      },
      include: {
        asset: {
          select: { id: true, name: true, assetTag: true, plantId: true, departmentId: true },
        },
        component: {
          select: { id: true, name: true, componentCode: true, componentType: true, assetId: true },
        },
        assignedTo: { select: { id: true, fullName: true, username: true } },
        department: { select: { id: true, name: true, code: true } },
      },
    });

    results.dueSchedulesChecked = dueSchedules.length;

    for (const schedule of dueSchedules) {
      // Skip non-auto-calculable frequencies
      if (!isAutoCalculableFrequency(schedule.frequencyType)) {
        results.skipped++;
        continue;
      }

      const nextDueDate = new Date(schedule.nextDueDate!);
      const leadWindow = new Date(now.getTime() + schedule.leadDays * 24 * 60 * 60 * 1000);

      // Check if within lead window
      if (nextDueDate > leadWindow) {
        results.skipped++;
        continue;
      }

      // Check if a WO was already generated for this cycle
      const existingWo = await db.workOrder.findFirst({
        where: {
          pmScheduleId: schedule.id,
          type: 'preventive',
          status: { not: 'cancelled' },
          createdAt: { gte: new Date(nextDueDate.getTime() - 24 * 60 * 60 * 1000) },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (existingWo) {
        results.skipped++;
        continue;
      }

      // Generate the WO
      const woNumber = await generateWoNumber();
      const wo = await db.workOrder.create({
        data: {
          woNumber,
          title: `PM: ${schedule.title}`,
          description: `Preventive maintenance scheduled for asset: ${schedule.asset.name || schedule.asset.assetTag}${schedule.component ? ` | Component: ${schedule.component.componentCode} - ${schedule.component.name}` : ''}`,
          type: 'preventive',
          priority: schedule.priority,
          status: 'draft',
          assetId: schedule.assetId,
          assetName: schedule.asset.name,
          assignedTo: schedule.assignedToId,
          departmentId: schedule.asset.departmentId || schedule.departmentId || null,
          plantId: schedule.asset.plantId || null,
          estimatedHours: schedule.estimatedDuration || null,
          pmScheduleId: schedule.id,
          plannedStart: nextDueDate,
          notes: `Auto-generated from PM schedule "${schedule.title}" (${schedule.frequencyType}: ${schedule.frequencyValue})`,
        },
      });

      if (schedule.componentId) {
        await db.workOrderComponent.upsert({
          where: {
            workOrderId_componentRegistryId: {
              workOrderId: wo.id,
              componentRegistryId: schedule.componentId,
            },
          },
          create: {
            workOrderId: wo.id,
            componentRegistryId: schedule.componentId,
            notes: 'Inherited from component-targeted PM schedule',
          },
          update: {},
        });
      }

      // Calculate the next due date
      const newNextDueDate = calculateNextDueDate(
        nextDueDate,
        schedule.frequencyType,
        schedule.frequencyValue,
      );

      await db.pmSchedule.update({
        where: { id: schedule.id },
        data: {
          lastCompletedDate: nextDueDate,
          nextDueDate: newNextDueDate,
        },
      });

      // Notify assigned user
      if (schedule.assignedToId) {
        await notifyUser(
          schedule.assignedToId,
          'wo_assigned',
          'PM Work Order Generated',
          `A preventive maintenance WO (${woNumber}) has been auto-generated for "${schedule.title}" on ${schedule.asset.name}. Due: ${nextDueDate.toLocaleDateString()}.`,
          'work_order',
          wo.id,
          `wo-detail?id=${wo.id}`,
        );
      }

      // Audit log
      const auditUserId = session?.userId || 'system';
      await db.auditLog.create({
        data: {
          userId: auditUserId,
          action: 'create',
          entityType: 'work_order',
          entityId: wo.id,
          newValues: JSON.stringify({
            woNumber,
            title: wo.title,
            type: 'preventive',
            pmScheduleId: schedule.id,
            componentId: schedule.componentId || null,
            autoGenerated: true,
          }),
        },
      });

      results.workOrdersGenerated++;
      results.generatedDetails.push({
        scheduleId: schedule.id,
        scheduleTitle: schedule.title,
        workOrderId: wo.id,
        woNumber,
      });
    }

    // ── PHASE 2: Detect and alert overdue PM schedules ──
    // Find schedules that are overdue (nextDueDate < now) and have no open WO
    const overdueSchedules = await db.pmSchedule.findMany({
      where: {
        isActive: true,
        nextDueDate: { not: null, lt: now },
      },
      include: {
        asset: {
          select: { id: true, name: true, assetTag: true },
        },
        assignedTo: { select: { id: true, fullName: true, username: true } },
      },
    });

    for (const schedule of overdueSchedules) {
      const nextDueDate = new Date(schedule.nextDueDate!);
      const daysOverdue = Math.floor((now.getTime() - nextDueDate.getTime()) / (1000 * 60 * 60 * 24));

      // Check if there is already an open (non-cancelled) WO for this schedule
      const openWo = await db.workOrder.findFirst({
        where: {
          pmScheduleId: schedule.id,
          type: 'preventive',
          status: {
            in: ['draft', 'requested', 'approved', 'planned', 'assigned', 'in_progress', 'waiting_parts', 'on_hold'],
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (openWo) {
        // There's already an open WO — skip alert
        continue;
      }

      results.overdueSchedulesFound++;
      results.overdueDetails.push({
        scheduleId: schedule.id,
        scheduleTitle: schedule.title,
        nextDueDate: nextDueDate.toISOString(),
        daysOverdue,
        assetName: schedule.asset.name,
      });

      // Send overdue notification to the assigned user (or admin)
      const notifyTargetId = schedule.assignedToId || session?.userId;
      if (notifyTargetId) {
        await notifyUser(
          notifyTargetId,
          'pm_overdue',
          'PM Schedule Overdue',
          `PM schedule "${schedule.title}" for asset ${schedule.asset.name} is ${daysOverdue} day(s) overdue (was due ${nextDueDate.toLocaleDateString()}). No open work order exists.`,
          'pm_schedule',
          schedule.id,
          `pm-schedules`,
        );
        results.overdueAlertsSent++;
      }
    }

    // ── PHASE 3: Return summary ──
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
