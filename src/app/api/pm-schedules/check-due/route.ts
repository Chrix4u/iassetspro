import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope, type PlantScopeResult } from '@/lib/plant-scope';
import { isAutoCalculableFrequency } from '@/lib/pm-utils';
import { notifyUser } from '@/lib/notifications';
import { resolvePmAutomationActorId } from '@/lib/pm-automation-actor';

/**
 * POST /api/pm-schedules/check-due
 *
 * Checks active PM schedules where autoGenerateWO is true and nextDueDate is
 * within the lead window. Each due cycle is serialized with a PostgreSQL
 * advisory transaction lock so concurrent cron/manual invocations cannot
 * generate duplicate preventive work orders.
 *
 * Auth:
 * - a valid X-PM-Cron-Secret is trusted system automation and may run system-wide;
 * - a manual caller must be authenticated and hold pm_schedules.run (or admin),
 *   and generation is restricted to that caller's plant scope.
 */

const CRON_SECRET = process.env.PM_CRON_SECRET || '';
const DENY_ACCESS_SENTINEL = '__ACCESS_DENIED__';

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

    // A cron run is attributed to the configured automation actor even if the
    // request also carries an unrelated browser session. Manual runs retain the
    // initiating user as the audit actor.
    const automationActorId = await resolvePmAutomationActorId(
      hasValidCronSecret ? undefined : session?.userId,
    );
    const now = new Date();

    const dueSchedules = await db.pmSchedule.findMany({
      where: {
        isActive: true,
        autoGenerateWO: true,
        nextDueDate: { not: null },
        asset: manualAssetPlantFilter(plantScope),
      },
      select: { id: true },
    });

    const results: {
      scheduleId: string;
      scheduleTitle: string;
      workOrderId: string;
      woNumber: string;
      skipped: boolean;
      reason?: string;
    }[] = [];

    for (const candidate of dueSchedules) {
      const generation = await db.$transaction(async (tx) => {
        // Serialize one PM schedule's due-cycle decision. A second worker waits,
        // then re-checks for the WO committed by the first worker.
        await tx.$executeRawUnsafe(
          'SELECT pg_advisory_xact_lock(hashtext($1))',
          `iassetspro:pm-due:${candidate.id}`,
        );

        const schedule = await tx.pmSchedule.findUnique({
          where: { id: candidate.id },
          include: {
            asset: {
              select: { id: true, name: true, assetTag: true, plantId: true, departmentId: true },
            },
            component: {
              select: { id: true, name: true, componentCode: true, componentType: true, assetId: true },
            },
            assignedTo: { select: { id: true, fullName: true, username: true } },
            department: { select: { id: true, name: true, code: true } },
            template: {
              select: {
                id: true,
                title: true,
                type: true,
                tasks: {
                  where: { isActive: true },
                  orderBy: { taskNumber: 'asc' },
                  select: {
                    taskNumber: true,
                    description: true,
                    taskType: true,
                    requiredParts: true,
                    estimatedMinutes: true,
                  },
                },
              },
            },
          },
        });

        if (!schedule) {
          return {
            scheduleId: candidate.id,
            scheduleTitle: 'Unknown PM schedule',
            workOrderId: '',
            woNumber: '',
            skipped: true as const,
            reason: 'PM schedule no longer exists',
          };
        }

        if (!schedule.isActive || !schedule.autoGenerateWO || !schedule.nextDueDate) {
          return {
            scheduleId: schedule.id,
            scheduleTitle: schedule.title,
            workOrderId: '',
            woNumber: '',
            skipped: true as const,
            reason: 'PM schedule is no longer active for automatic generation',
          };
        }

        if (!isAutoCalculableFrequency(schedule.frequencyType)) {
          return {
            scheduleId: schedule.id,
            scheduleTitle: schedule.title,
            workOrderId: '',
            woNumber: '',
            skipped: true as const,
            reason: `${schedule.frequencyType} requires external trigger (meter reading)`,
          };
        }

        const nextDueDate = new Date(schedule.nextDueDate);
        const leadWindow = new Date(now.getTime() + schedule.leadDays * 24 * 60 * 60 * 1000);
        if (nextDueDate > leadWindow) {
          return {
            scheduleId: schedule.id,
            scheduleTitle: schedule.title,
            workOrderId: '',
            woNumber: '',
            skipped: true as const,
            reason: 'Not within lead window yet',
          };
        }

        // plannedStart is the due-cycle identity. Unlike a createdAt buffer this
        // remains stable even when leadDays generates the WO several days early.
        const existingWo = await tx.workOrder.findFirst({
          where: {
            pmScheduleId: schedule.id,
            type: 'preventive',
            status: { not: 'cancelled' },
            plannedStart: nextDueDate,
          },
          orderBy: { createdAt: 'desc' },
          select: { id: true, woNumber: true },
        });

        if (existingWo) {
          return {
            scheduleId: schedule.id,
            scheduleTitle: schedule.title,
            workOrderId: existingWo.id,
            woNumber: existingWo.woNumber,
            skipped: true as const,
            reason: 'WO already generated for this due cycle',
          };
        }

        let woDescription = `Preventive maintenance scheduled for asset: ${schedule.asset.name || schedule.asset.assetTag}${schedule.component ? ` | Component: ${schedule.component.componentCode} - ${schedule.component.name}` : ''}`;
        let estimatedHours = schedule.estimatedDuration || null;
        const tasks = schedule.template?.tasks || [];

        if (tasks.length > 0) {
          const taskLines = tasks.map(
            (task) => `  ${task.taskNumber}. [${task.taskType}] ${task.description}${task.estimatedMinutes ? ` (~${task.estimatedMinutes}min)` : ''}${task.requiredParts ? ` | Parts: ${task.requiredParts}` : ''}`,
          );
          woDescription += `\n\nPM Template: ${schedule.template?.title || 'N/A'} (${schedule.template?.type || 'preventive'})\nTask Checklist:\n${taskLines.join('\n')}`;

          if (!estimatedHours) {
            const totalMinutes = tasks.reduce((sum, task) => sum + (task.estimatedMinutes || 15), 0);
            estimatedHours = Math.round((totalMinutes / 60) * 100) / 100;
          }

          const allParts: string[] = [];
          for (const task of tasks) {
            if (!task.requiredParts) continue;
            try {
              const parts = JSON.parse(task.requiredParts);
              if (Array.isArray(parts)) {
                for (const part of parts) {
                  if (typeof part === 'string') allParts.push(part);
                  else if (part?.partName) allParts.push(`${part.partName}${part.quantity ? ` (x${part.quantity})` : ''}`);
                }
              }
            } catch {
              // Ignore malformed optional template metadata; do not block PM generation.
            }
          }
          if (allParts.length > 0) woDescription += `\n\nRequired Parts: ${allParts.join(', ')}`;
        }

        const woDate = new Date();
        const prefix = `WO-${woDate.getFullYear()}${String(woDate.getMonth() + 1).padStart(2, '0')}`;

        // Serialize PM WO-number allocation across schedules. The schedule lock
        // prevents duplicate due cycles; this short global/month lock prevents
        // two PM schedules from choosing the same number concurrently.
        await tx.$executeRawUnsafe(
          'SELECT pg_advisory_xact_lock(hashtext($1))',
          `iassetspro:pm-wo-number:${prefix}`,
        );

        const monthlyNumbers = await tx.workOrder.findMany({
          where: { woNumber: { startsWith: prefix } },
          select: { woNumber: true },
        });
        const highestNumber = monthlyNumbers.reduce((max, row) => {
          const suffix = Number.parseInt(row.woNumber.slice(prefix.length + 1), 10);
          return Number.isFinite(suffix) ? Math.max(max, suffix) : max;
        }, 0);
        const woNumber = `${prefix}-${String(highestNumber + 1).padStart(4, '0')}`;

        const wo = await tx.workOrder.create({
          data: {
            woNumber,
            title: `PM: ${schedule.title}`,
            description: woDescription,
            type: 'preventive',
            priority: schedule.priority,
            status: 'draft',
            assetId: schedule.assetId,
            assetName: schedule.asset.name,
            assignedTo: schedule.assignedToId,
            departmentId: schedule.asset.departmentId || schedule.departmentId || null,
            plantId: schedule.asset.plantId || null,
            estimatedHours,
            pmScheduleId: schedule.id,
            plannedStart: nextDueDate,
            notes: `Auto-generated from PM schedule "${schedule.title}" (${schedule.frequencyType}: ${schedule.frequencyValue})${schedule.template ? ` | Template: ${schedule.template.title} (${tasks.length} tasks)` : ''}`,
          },
        });

        if (schedule.componentId) {
          await tx.workOrderComponent.upsert({
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

        for (const task of tasks) {
          await tx.workOrderComment.create({
            data: {
              workOrderId: wo.id,
              userId: automationActorId,
              content: `[PM Task #${task.taskNumber}] [${task.taskType.toUpperCase()}] ${task.description}${task.estimatedMinutes ? ` — Est: ${task.estimatedMinutes} min` : ''}${task.requiredParts ? ` — Parts: ${task.requiredParts}` : ''}`,
            },
          });
        }

        await tx.auditLog.create({
          data: {
            userId: automationActorId,
            action: 'create',
            entityType: 'work_order',
            entityId: wo.id,
            newValues: JSON.stringify({
              woNumber,
              title: wo.title,
              type: 'preventive',
              pmScheduleId: schedule.id,
              componentId: schedule.componentId || null,
              dueCycle: nextDueDate.toISOString(),
              autoGenerated: true,
            }),
          },
        });

        return {
          scheduleId: schedule.id,
          scheduleTitle: schedule.title,
          workOrderId: wo.id,
          woNumber,
          skipped: false as const,
          assignedToId: schedule.assignedToId,
          assetName: schedule.asset.name,
          dueDate: nextDueDate,
        };
      });

      results.push({
        scheduleId: generation.scheduleId,
        scheduleTitle: generation.scheduleTitle,
        workOrderId: generation.workOrderId,
        woNumber: generation.woNumber,
        skipped: generation.skipped,
        ...('reason' in generation && generation.reason ? { reason: generation.reason } : {}),
      });

      if (!generation.skipped && generation.assignedToId) {
        try {
          await notifyUser(
            generation.assignedToId,
            'wo_assigned',
            'PM Work Order Generated',
            `A preventive maintenance WO (${generation.woNumber}) has been auto-generated for "${generation.scheduleTitle}" on ${generation.assetName}. Due: ${generation.dueDate.toLocaleDateString()}.`,
            'work_order',
            generation.workOrderId,
            `wo-detail?id=${generation.workOrderId}`,
          );
        } catch (notificationError) {
          // The WO transaction is already committed. A notification outage must
          // not turn a successful generation into a retry that appears to fail.
          console.error('[PM Check-Due Notification Error]', notificationError);
        }
      }
    }

    const generated = results.filter((result) => !result.skipped);
    const skipped = results.filter((result) => result.skipped);

    return NextResponse.json({
      success: true,
      data: {
        checked: dueSchedules.length,
        generated: generated.length,
        skipped: skipped.length,
        results,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to check PM schedules';
    console.error('[PM Check-Due Error]', message, error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
