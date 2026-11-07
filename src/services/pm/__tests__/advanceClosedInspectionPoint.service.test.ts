import { describe, expect, it, vi } from 'vitest';
import { advanceClosedInspectionPoint } from '@/services/pm/advanceClosedInspectionPoint.service';

function harness(record: { id: string; inspectionPointId: string; inspectedAt: Date } | null, point: {
  id: string; isActive: boolean; frequency: string; nextInspection: Date | null
} | null) {
  const tx = {
    componentInspectionRecord: { findFirst: vi.fn().mockResolvedValue(record) },
    componentInspectionPoint: {
      findUnique: vi.fn().mockResolvedValue(point),
      update: vi.fn().mockResolvedValue({}),
    },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const input = {
    tx: tx as never,
    workOrderId: 'wo-1',
    woNumber: 'WO-202611-0001',
    woActualEnd: new Date('2026-11-08T11:00:00Z'),
    closedAt: new Date('2026-11-09T11:00:00Z'),
    actorId: 'planner-1',
  };
  return { tx, input };
}

describe('inspection recurrence at planner-verified close', () => {
  it('does not alter a WO without an inspection trigger', async () => {
    const { tx, input } = harness(null, null);
    const outcome = await advanceClosedInspectionPoint(input);
    expect(outcome.advanced).toBe(false);
    expect(tx.componentInspectionPoint.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('advances a failed inspection only at WO close using the actual technician completion date', async () => {
    const { tx, input } = harness(
      { id: 'insp-1', inspectionPointId: 'point-1', inspectedAt: new Date('2026-11-07T10:00:00Z') },
      { id: 'point-1', isActive: true, frequency: 'weekly', nextInspection: new Date('2026-11-07T00:00:00Z') },
    );
    const result = await advanceClosedInspectionPoint(input);
    expect(result.advanced).toBe(true);
    expect(result.nextInspection?.toISOString()).toBe('2026-11-15T11:00:00.000Z');
    expect(tx.componentInspectionPoint.update).toHaveBeenCalledWith({
      where: { id: 'point-1' }, data: { nextInspection: new Date('2026-11-15T11:00:00Z') },
    });
    expect(tx.auditLog.create).toHaveBeenCalledOnce();
  });

  it('refuses to silently advance an unsupported schedule interval', async () => {
    const { tx, input } = harness(
      { id: 'insp-1', inspectionPointId: 'point-1', inspectedAt: new Date('2026-11-07T10:00:00Z') },
      { id: 'point-1', isActive: true, frequency: 'per_start', nextInspection: new Date('2026-11-07T00:00:00Z') },
    );
    await expect(advanceClosedInspectionPoint(input)).rejects.toThrow(/unsupported interval/);
    expect(tx.componentInspectionPoint.update).not.toHaveBeenCalled();
  });

  it('does not advance a deactivated inspection point', async () => {
    const { tx, input } = harness(
      { id: 'insp-1', inspectionPointId: 'point-1', inspectedAt: new Date('2026-11-07T10:00:00Z') },
      { id: 'point-1', isActive: false, frequency: 'daily', nextInspection: null },
    );
    expect((await advanceClosedInspectionPoint(input)).advanced).toBe(false);
    expect(tx.componentInspectionPoint.update).not.toHaveBeenCalled();
  });
});
