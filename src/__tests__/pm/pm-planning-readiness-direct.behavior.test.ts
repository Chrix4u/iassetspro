import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const mock = vi.hoisted(() => ({
  session: vi.fn(), access: vi.fn(), workOrder: vi.fn(), modules: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ getSession: mock.session }));
vi.mock('@/lib/db', () => ({ db: { workOrder: { findUnique: mock.workOrder } } }));
vi.mock('@/lib/plant-auth-helpers', () => ({
  authorizeWorkOrderExecutionAccess: mock.access,
}));
vi.mock('@/lib/module-access.server', () => ({
  getUnavailableOperationalModules: mock.modules,
}));
import { GET } from '@/app/api/work-orders/[id]/pm-planning-readiness/route';

const req = new NextRequest('http://localhost/api/work-orders/wo-1/pm-planning-readiness');
const ctx = { params: Promise.resolve({ id: 'wo-1' }) };
const wo = {
  id: 'wo-1', pmScheduleId: null, plannerId: 'planner-1', assignedTo: 'tech-1',
  assignedSupervisorId: 'supervisor-1', departmentId: 'mechanical',
  suggestedParts: '[]', suggestedTools: '[]',
  taskExecutions: [
    { pmScheduleTaskId: 'direct-assignment-1', requiredParts: '[]', estimatedMinutes: 50 },
  ],
  repairMaterialRequests: [], repairToolRequests: [], pmSchedule: null,
};
describe('PM planning readiness for direct assignments and legacy schedules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.session.mockReturnValue({ userId: 'planner-1' });
    mock.access.mockResolvedValue({ ok: true, entity: { id: 'wo-1', plantId: 'plant-1' } });
    mock.workOrder.mockResolvedValue({ ...wo });
    mock.modules.mockResolvedValue([]);
  });
  it('preserves authenticated plant / execution authorization before loading resources', async () => {
    mock.session.mockReturnValue(null);
    expect((await GET(req, ctx)).status).toBe(401);
    expect(mock.access).not.toHaveBeenCalled();
    mock.session.mockReturnValue({ userId: 'planner-1' });
    mock.access.mockResolvedValue({
      ok: false, response: NextResponse.json({ success: false }, { status: 403 }),
    });
    expect((await GET(req, ctx)).status).toBe(403);
    expect(mock.workOrder).not.toHaveBeenCalled();
  });
  it('runs existing resource checks for a direct PM assignment without a schedule container', async () => {
    const response = await GET(req, ctx);
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.data).toMatchObject({
      readyForPlanning: true,
      schedule: { id: null, title: 'Direct PM assignment', source: 'direct_assignment' },
      provenance: { source: 'direct_assignment', assignmentCount: 1 },
      checklist: { taskCount: 1, estimatedMinutes: 50 },
      workloadEstimate: { knownMinutes: 50, unestimatedTaskCount: 0, complete: true },
    });
    expect(mock.workOrder).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        taskExecutions: expect.objectContaining({
          select: expect.objectContaining({ pmScheduleTaskId: true }),
        }),
      }),
    }));
  });
  it('retains legacy template skill and tool requirements', async () => {
    mock.workOrder.mockResolvedValue({
      ...wo, pmScheduleId: 'schedule-1',
      pmSchedule: { id: 'schedule-1', title: 'Weekly Lubrication',
        template: { id: 'template-1', title: 'Lubrication',
          requiredSkills: JSON.stringify(['Fitter']),
          requiredTools: JSON.stringify(['Grease gun']),
        },
      },
    });
    const response = await GET(req, ctx);
    const data = (await response.json()).data;
    expect(response.status).toBe(200);
    expect(data).toMatchObject({
      schedule: { id: 'schedule-1', source: 'legacy_schedule', templateId: 'template-1' },
      requiredSkills: ['Fitter'],
    });
    expect(data.warnings.map((row: {code:string}) => row.code)).toContain('unmapped_tools');
  });
  it('rejects unrelated Repairs work orders with no server-side PM task provenance', async () => {
    mock.workOrder.mockResolvedValue({ ...wo, taskExecutions: [
      { pmScheduleTaskId: null, requiredParts: '[]', estimatedMinutes: 20 },
    ] });
    const result = await GET(req, ctx);
    expect(result.status).toBe(400);
    expect((await result.json()).error).toMatch(/not linked to a PM/i);
  });
  it('fails closed on corrupted legacy schedule provenance, not falling back to direct PM', async () => {
    mock.workOrder.mockResolvedValue({ ...wo, pmScheduleId: 'orphan-1' });
    const response = await GET(req, ctx);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/missing schedule/i);
  });
  it('keeps missing labour estimates explicit when a PM checklist has unestimated work', async () => {
    mock.workOrder.mockResolvedValue({ ...wo, taskExecutions: [
      { pmScheduleTaskId: 'pm-1', estimatedMinutes: 50, requiredParts: '[]' },
      { pmScheduleTaskId: 'pm-2', estimatedMinutes: null, requiredParts: '[]' },
    ] });
    const response = await GET(req, ctx);
    const data = (await response.json()).data;
    expect(data).toMatchObject({
      checklist: { taskCount: 2, estimatedMinutes: 50 },
      workloadEstimate: { knownMinutes: 50, unestimatedTaskCount: 1, complete: false },
    });
    expect(data.warnings.map((row: {code:string}) => row.code)).toContain('effort_estimate_missing');
  });
});
