import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';
import { allowedProductionMeter } from '@/lib/production-shift-survey';
import { calculateProductionPmProgress } from '@/lib/production-pm-progress';

/** Read-only: projected PM thresholds from current production output.
 * Uses the same source value as each existing PM engine, but never evaluates
 * triggers or promises that a work order has already been generated.
 */
export async function GET(request: NextRequest) {
  const session = getSession(request);
  if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  if (!isAdmin(session) && !hasPermission(session, 'production_surveys.view')) {
    return NextResponse.json({ success: false, error: 'Production survey view permission required' }, { status: 403 });
  }
  try {
    const assetId = new URL(request.url).searchParams.get('assetId');
    if (!assetId) return NextResponse.json({ success: false, error: 'Select a machine first' }, { status: 400 });
    const scope = await getPlantScope(request, session);
    if (scope.denyAccess) return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    const asset = await db.asset.findUnique({ where: { id: assetId }, select: { id: true, plantId: true } });
    if (!asset) return NextResponse.json({ success: false, error: 'Machine not found' }, { status: 404 });
    if (!canAccessPlantStrict(scope, asset.plantId)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    const [registeredMeters, taskAssignments, headerSchedules] = await Promise.all([
      db.assetMeter.findMany({
        where: { assetId, isActive: true },
        select: { id: true, name: true, unit: true, meterType: true, currentValue: true, lastReadingAt: true },
        orderBy: [{ name: 'asc' }, { unit: 'asc' }], take: 100,
      }),
      db.pmScheduleTask.findMany({
        where: { assetId, isActive: true, OR: [{ pmType: 'ubm' }, { basis: 'meter' }] },
        select: {
          id: true, assetMeterId: true, meterName: true, frequencyUnit: true, frequencyInterval: true,
          nextDueReading: true,
          pmTask: { select: { description: true } },
          schedule: { select: { id: true, title: true, isActive: true, autoGenerateWO: true, recurrenceAuthority: true } },
        },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], take: 200,
      }),
      db.pmSchedule.findMany({
        where: { assetId, isActive: true, frequencyType: 'meter', recurrenceAuthority: { not: 'task' } },
        select: {
          id: true, title: true, autoGenerateWO: true, frequencyValue: true, frequencyUnit: true,
          meterName: true, trigger: { select: { id: true, isActive: true, triggerType: true, triggerConfig: true, triggerValue: true } },
        }, take: 100,
      }),
    ]);
    const meters = registeredMeters.filter((meter) => allowedProductionMeter(meter.meterType));
    const meterKeys = new Set(meters.map(meter => meter.name + '\u0000' + meter.unit));
    const readings = await Promise.all(meters.map(async meter => {
      const reading = await db.meterReading.findFirst({
        where: { assetId, meterName: meter.name, unit: meter.unit },
        orderBy: [{ readingDate: 'desc' }, { createdAt: 'desc' }],
        select: { value: true, readingDate: true },
      });
      return { meterId: meter.id, reading };
    }));
    const latestByMeterId = new Map(readings.map(entry => [entry.meterId, entry.reading]));
    const getMeter = (name: string, unit: string) => meters.find(meter => meter.name === name && meter.unit === unit);
    const rows: Array<Record<string, unknown>> = [];
    for (const task of taskAssignments) {
      if (task.schedule && (!task.schedule.isActive || task.schedule.recurrenceAuthority !== 'task')) continue;
      if (!task.meterName || !task.frequencyUnit || task.nextDueReading === null || !Number.isFinite(task.nextDueReading)) continue;
      const meter = task.assetMeterId
        ? meters.find(m => m.id === task.assetMeterId && m.name === task.meterName && m.unit === task.frequencyUnit)
        : getMeter(task.meterName, task.frequencyUnit);
      if (!meter || !meterKeys.has(task.meterName + '\u0000' + task.frequencyUnit)) continue;
      // The assignment engine reads currentValue for an explicitly linked AssetMeter;
      // legacy unlinked UBM tasks read the most recent MeterReading instead.
      const reading = latestByMeterId.get(meter.id);
      const current = task.assetMeterId ? Number(meter.currentValue) : reading ? Number(reading.value) : null;
      const progress = calculateProductionPmProgress({
        current, nextDue: Number(task.nextDueReading), interval: task.frequencyInterval === null ? null : Number(task.frequencyInterval),
      });
      rows.push({
        id: task.id, source: 'task', description: task.pmTask.description,
        scheduleTitle: task.schedule?.title ?? null,
        autoGenerateWO: task.schedule?.autoGenerateWO ?? false,
        meterId: meter.id, meterName: meter.name, unit: meter.unit,
        ...progress,
      });
    }
    for (const schedule of headerSchedules) {
      if (!schedule.trigger || !schedule.trigger.isActive || schedule.trigger.triggerType !== 'meter') continue;
      let config: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(schedule.trigger.triggerConfig ?? '{}');
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) config = parsed as Record<string, unknown>;
      } catch { continue; }
      if (config.source !== 'asset_meter_reading') continue;
      const meterName = typeof config.meterName === 'string' ? config.meterName : schedule.meterName || '';
      const unit = typeof config.unit === 'string' ? config.unit : schedule.frequencyUnit || '';
      const meter = getMeter(meterName, unit);
      if (!meter) continue;
      const interval = Number(schedule.trigger.triggerValue || schedule.frequencyValue);
      const baseline = config.baselineValue;
      if (!(Number.isFinite(interval) && interval > 0)) continue;
      if (baseline === null || baseline === undefined || !Number.isFinite(Number(baseline))) continue;
      const latest = latestByMeterId.get(meter.id);
      const current = latest ? Number(latest.value) : null;
      const progress = calculateProductionPmProgress({
        current, nextDue: Number(baseline) + interval, interval,
      });
      rows.push({
        id: schedule.id, source: 'schedule', description: schedule.title, scheduleTitle: schedule.title,
        autoGenerateWO: schedule.autoGenerateWO,
        meterId: meter.id, meterName: meter.name, unit: meter.unit,
        ...progress,
      });
    }
    const priority = { due: 0, approaching: 1, upcoming: 2, awaiting_reading: 3 } as const;
    rows.sort((a, b) => {
      const first = priority[a.state as keyof typeof priority] ?? 4;
      const second = priority[b.state as keyof typeof priority] ?? 4;
      return first - second || String(a.description).localeCompare(String(b.description));
    });
    return NextResponse.json({
      success: true,
      data: {
        meters: meters.map(meter => ({
          id: meter.id, name: meter.name, unit: meter.unit, currentValue: meter.currentValue,
          lastReadingAt: meter.lastReadingAt,
        })),
        thresholds: rows,
      },
      meta: { note: 'Thresholds are read-only. A due reading does not by itself prove that a work order has been created.' },
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unable to load PM meter progress' }, { status: 500 });
  }
}
