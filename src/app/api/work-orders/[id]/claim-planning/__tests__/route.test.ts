import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  permission: vi.fn(),
  plantAuth: vi.fn(),
  member: vi.fn(),
  findOrder: vi.fn(),
  claim: vi.fn(),
  audit: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  getSession: mocks.session,
  hasAnyPermission: mocks.permission,
}));
vi.mock('@/lib/plant-auth-helpers', () => ({
  authorizeWorkOrderPlant: mocks.plantAuth,
}));
vi.mock('@/lib/db', () => ({
  db: {
    userPlant: { findFirst: mocks.member },
    workOrder: { findUnique: mocks.findOrder },
    $transaction: async (fn: (tx: unknown) => unknown) => fn({
      workOrder: { updateMany: mocks.claim },
      auditLog: { create: mocks.audit },
    }),
  },
}));

import { POST } from '@/app/api/work-orders/[id]/claim-planning/route';

const baseOrder = {
  id: 'wo-1', woNumber: 'WO-202611-0001', plantId: 'plant-a',
  pmScheduleId: 'schedule-a', status: 'draft', isLocked: false, plannerId: null,
};

async function call() {
  const response = await POST(
    new NextRequest('http://localhost/api/work-orders/wo-1/claim-planning', { method: 'POST' }),
    { params: Promise.resolve({ id: 'wo-1' }) },
  );
  return { status: response.status, body: await response.json() };
}

describe('PM orphan draft planner claim: plant-safe, atomic, audited', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockReturnValue({ userId: 'planner-a', roles: ['maintenance_planner'] });
    mocks.permission.mockReturnValue(true);
    mocks.plantAuth.mockResolvedValue({ ok: true, entity: { id: 'wo-1', plantId: 'plant-a' } });
    mocks.member.mockResolvedValue({ id: 'membership-a' });
    mocks.findOrder.mockResolvedValue({ ...baseOrder });
    mocks.claim.mockResolvedValue({ count: 1 });
    mocks.audit.mockResolvedValue({ id: 'audit-1' });
  });

  it('requires authentication before touching a work order', async () => {
    mocks.session.mockReturnValue(null);
    expect((await call()).status).toBe(401);
    expect(mocks.plantAuth).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it('rejects a technician even when a broad update permission was accidentally granted', async () => {
    mocks.session.mockReturnValue({ userId: 'tech-a', roles: ['maintenance_technician'] });
    expect((await call()).status).toBe(403);
    expect(mocks.plantAuth).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it('requires the planner work-order update permission', async () => {
    mocks.permission.mockReturnValue(false);
    expect((await call()).status).toBe(403);
    expect(mocks.plantAuth).not.toHaveBeenCalled();
  });

  it('enforces strict work-order plant scope before querying the planner membership', async () => {
    mocks.plantAuth.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ success: false, error: 'Access denied' }, { status: 403 }),
    });
    expect((await call()).status).toBe(403);
    expect(mocks.member).not.toHaveBeenCalled();
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it('rejects an inactive, read-only or cross-plant user without valid writable membership', async () => {
    mocks.member.mockResolvedValue(null);
    expect((await call()).status).toBe(403);
    expect(mocks.member).toHaveBeenCalledWith({
      where: {
        userId: 'planner-a',
        plantId: 'plant-a',
        accessLevel: { in: ['write', 'admin'] },
        user: {
          is: {
            status: 'active',
            userRoles: {
              some: { role: { slug: { in: ['planner', 'maintenance_planner'] } } },
            },
          },
        },
      },
      select: { id: true },
    });
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it('only accepts unlocked draft work orders linked to a PM schedule', async () => {
    for (const variant of [
      { pmScheduleId: null },
      { status: 'assigned' },
      { status: 'closed' },
      { isLocked: true },
    ]) {
      mocks.findOrder.mockResolvedValue({ ...baseOrder, ...variant });
      expect((await call()).status).toBe(409);
    }
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('claims once with a compare-and-set and writes an atomic audit trail', async () => {
    const result = await call();
    expect(result.status).toBe(200);
    expect(result.body.data).toEqual({
      id: 'wo-1', woNumber: baseOrder.woNumber, plannerId: 'planner-a',
      status: 'draft', duplicate: false,
    });
    expect(mocks.claim).toHaveBeenCalledWith({
      where: {
        id: 'wo-1', plantId: 'plant-a', pmScheduleId: { not: null },
        status: 'draft', isLocked: false, plannerId: null,
      },
      data: { plannerId: 'planner-a' },
    });
    expect(mocks.audit).toHaveBeenCalledOnce();
    expect(mocks.audit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'planner-a',
        entityType: 'work_order',
        entityId: 'wo-1',
        plantId: 'plant-a',
        oldValues: JSON.stringify({ plannerId: null }),
        newValues: JSON.stringify({
          plannerId: 'planner-a',
          reason: 'authorized_plant_planner_claimed_legacy_pm_draft',
        }),
      }),
    });
  });

  it('replaying a successful claim is idempotent, without a second audit record', async () => {
    mocks.findOrder.mockResolvedValue({ ...baseOrder, plannerId: 'planner-a' });
    const result = await call();
    expect(result.status).toBe(200);
    expect(result.body.data.duplicate).toBe(true);
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('will not overwrite an existing different planner', async () => {
    mocks.findOrder.mockResolvedValue({ ...baseOrder, plannerId: 'planner-b' });
    expect((await call()).status).toBe(409);
    expect(mocks.claim).not.toHaveBeenCalled();
  });

  it('handles a concurrent different-planner claim without writing an audit row', async () => {
    mocks.claim.mockResolvedValue({ count: 0 });
    mocks.findOrder
      .mockResolvedValueOnce({ ...baseOrder })
      .mockResolvedValueOnce({
        woNumber: baseOrder.woNumber, status: 'draft', plannerId: 'planner-b',
      });
    expect((await call()).status).toBe(409);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it('handles an idempotent concurrent same-planner claim', async () => {
    mocks.claim.mockResolvedValue({ count: 0 });
    mocks.findOrder
      .mockResolvedValueOnce({ ...baseOrder })
      .mockResolvedValueOnce({
        woNumber: baseOrder.woNumber, status: 'draft', plannerId: 'planner-a',
      });
    const result = await call();
    expect(result.status).toBe(200);
    expect(result.body.data.duplicate).toBe(true);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
