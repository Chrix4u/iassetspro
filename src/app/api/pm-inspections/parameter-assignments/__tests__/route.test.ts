import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  session: vi.fn(), scope: vi.fn(), asset: vi.fn(), parts: vi.fn(),
  count: vi.fn(), assignments: vi.fn(), points: vi.fn(),
  oldPoints: vi.fn(), createPoint: vi.fn(), updatePoint: vi.fn(),
  recordCount: vi.fn(), linkPoints: vi.fn(), audit: vi.fn(),
  transaction: vi.fn(), admin: vi.fn(), permission: vi.fn(), plantAccess: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({
  getSession: mocks.session, isAdmin: mocks.admin, hasPermission: mocks.permission,
}));
vi.mock('@/lib/plant-scope', () => ({
  getPlantScope: mocks.scope, canAccessPlantStrict: mocks.plantAccess,
}));
vi.mock('@/lib/db', () => ({ db: {
  asset: { findUnique: mocks.asset },
  componentRegistry: { findMany: mocks.parts, count: mocks.count },
  pmScheduleTask: { findMany: mocks.assignments },
  componentInspectionPoint: { findMany: mocks.points },
  $transaction: mocks.transaction,
} }));
import { GET, POST } from '@/app/api/pm-inspections/parameter-assignments/route';

const machine = { id: 'm1', name: 'Production line', assetTag: 'M-050', plantId: 'plant-1' };
const part = (n: number) => ({ id: 'p' + n, componentCode: 'M-050-' + n, name: 'Bearing ' + n, componentType: 'part', parentId: null });
const assignment = (n: number) => ({
  componentId: 'p' + n, nextDueDate: new Date('2026-11-15T00:00:00Z'),
  pmTaskId: 'task-temp',
  pmTask: { id: 'task-temp', taskNumber: 1, description: 'Inspect temperature' },
});
const temp = { key: 'temperature', name: 'Temperature', method: 'measurement', min: null, max: 85, unit: '°C', acceptance: '' };
const req = (body: Record<string, unknown>) => new NextRequest('http://localhost/api/pm-inspections/parameter-assignments', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const body = { assetId: 'm1', equipmentState: 'standstill', pmTaskId: 'task-temp', componentIds: ['p1','p2'], frequency: 'monthly', parameters: [temp] };

describe('plant-scoped bulk Action List parameter assignments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session.mockReturnValue({userId:'planner-1'});
    mocks.admin.mockReturnValue(true);
    mocks.permission.mockReturnValue(true);
    mocks.plantAccess.mockReturnValue(true);
    mocks.scope.mockResolvedValue({denyAccess:false,isScoped:true,plantId:'plant-1'});
    mocks.asset.mockResolvedValue(machine);
    mocks.parts.mockResolvedValue([part(1),part(2)]);
    mocks.count.mockResolvedValue(2);
    mocks.assignments.mockResolvedValue([assignment(1),assignment(2)]);
    mocks.points.mockResolvedValue([]);
    mocks.oldPoints.mockResolvedValue([]);
    let counter=0;
    mocks.createPoint.mockImplementation(({data}: {data: Record<string,unknown>}) => Promise.resolve({
      id: 'point-' + (++counter), ...data,
    }));
    mocks.linkPoints.mockResolvedValue({count:2});
    mocks.updatePoint.mockResolvedValue({});
    mocks.recordCount.mockResolvedValue(0);
    mocks.audit.mockResolvedValue({});
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      componentInspectionPoint: { findMany: mocks.oldPoints, create: mocks.createPoint, update: mocks.updatePoint },
      componentInspectionRecord: { count: mocks.recordCount },
      pmInspectionTaskPoint: { createMany: mocks.linkPoints },
      auditLog: { create: mocks.audit },
    }));
  });

  it('never exposes machine thresholds without authentication or planning permission', async () => {
    mocks.session.mockReturnValue(null);
    expect((await GET(new NextRequest('http://localhost/api/pm-inspections/parameter-assignments?assetId=m1&equipmentState=standstill'))).status).toBe(401);
    expect((await POST(req(body))).status).toBe(401);
    mocks.session.mockReturnValue({userId:'viewer'});
    mocks.admin.mockReturnValue(false);
    mocks.permission.mockReturnValue(false);
    expect((await POST(req(body))).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it('rejects cross-plant parameter assignments even for a planner', async () => {
    mocks.plantAccess.mockReturnValue(false);
    expect((await POST(req(body))).status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it('lists the machine parts, their existing points and eligible PM tasks', async () => {
    const response = await GET(new NextRequest('http://localhost/api/pm-inspections/parameter-assignments?assetId=m1&equipmentState=standstill'));
    expect(response.status).toBe(200);
    const data = (await response.json()).data;
    expect(data.parts).toHaveLength(2);
    expect(data.parts[0].taskIds).toContain('task-temp');
    expect(data.tasks[0].assignedPartCount).toBe(2);
  });
  it('assigns approved temperature limits to exact parts without altering PM due dates', async () => {
    const response=await POST(req(body));
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({created:2,mapped:2,conflicted:0});
    expect(mocks.createPoint).toHaveBeenCalledTimes(2);
    for (const call of mocks.createPoint.mock.calls) {
      expect(call[0].data.normalRange).toBe('{"min":null,"max":85,"unit":"°C"}');
      expect(call[0].data.nextInspection).toEqual(new Date('2026-11-15T00:00:00Z'));
    }
    expect(mocks.linkPoints).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.arrayContaining([expect.objectContaining({pmTaskId:'task-temp'})]),
      skipDuplicates:true,
    }));
    expect(mocks.audit).toHaveBeenCalledTimes(1);
  });
  it('reuses identical checkpoints on retry instead of duplicating readings or changing thresholds', async () => {
    mocks.parts.mockResolvedValue([part(1)]);
    mocks.oldPoints.mockResolvedValue([{id:'old-point',componentId:'p1',name:'Temperature',
      parameterKey:'temperature',inspectionType:'measurement',
      normalRange:'{"min":null,"max":85,"unit":"°C"}'}]);
    const result=await POST(req({...body,componentIds:['p1']}));
    expect((await result.json()).data).toMatchObject({created:0,reused:1,conflicted:0,mapped:1});
    expect(mocks.createPoint).not.toHaveBeenCalled();
  });
  it('refuses to overwrite an existing approved limit without revision', async () => {
    mocks.parts.mockResolvedValue([part(1)]);
    mocks.oldPoints.mockResolvedValue([{id:'old-point',componentId:'p1',name:'Temperature',
      parameterKey:'temperature',inspectionType:'measurement',
      normalRange:'{"min":null,"max":65,"unit":"°C"}'}]);
    const response=await POST(req({...body,componentIds:['p1']}));
    expect((await response.json()).data).toMatchObject({created:0,reused:0,conflicted:1});
    expect(mocks.createPoint).not.toHaveBeenCalled();
    expect(mocks.linkPoints).not.toHaveBeenCalled();
  });
  it('permits an audited explicit revision only when the checkpoint has no recorded evidence', async () => {
    mocks.parts.mockResolvedValue([part(1)]);
    mocks.oldPoints.mockResolvedValue([{id:'old-point',componentId:'p1',name:'Temperature',
      parameterKey:'temperature',inspectionType:'measurement',
      normalRange:'{"min":null,"max":65,"unit":"°C"}'}]);
    const result=await POST(req({...body,componentIds:['p1'],reviseUnused:true}));
    expect(result.status).toBe(200);
    expect((await result.json()).data).toMatchObject({created:0,updated:1,conflicted:0});
    expect(mocks.updatePoint).toHaveBeenCalledWith({
      where:{id:'old-point'},
      data:{name:'Temperature',parameterKey:'temperature',
        normalRange:'{"min":null,"max":85,"unit":"°C"}'},
    });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
      data:expect.objectContaining({action:'update',entityType:'component_inspection_point',
        oldValues:expect.stringContaining('65'),newValues:expect.stringContaining('85')}),
    }));
  });
  it('rejects limit changes to checkpoints with historical readings even when explicitly requested', async () => {
    mocks.parts.mockResolvedValue([part(1)]);
    mocks.oldPoints.mockResolvedValue([{id:'old-point',componentId:'p1',name:'Temperature',
      parameterKey:'temperature',inspectionType:'measurement',
      normalRange:'{"min":null,"max":65,"unit":"°C"}'}]);
    mocks.recordCount.mockResolvedValue(1);
    const response=await POST(req({...body,componentIds:['p1'],reviseUnused:true}));
    expect((await response.json()).data).toMatchObject({created:0,updated:0,conflicted:1});
    expect(mocks.updatePoint).not.toHaveBeenCalled();
  });
  it('validates task membership for every selected part and rejects cross-machine IDs', async () => {
    mocks.assignments.mockResolvedValue([assignment(1)]);
    expect((await POST(req(body))).status).toBe(422);
    mocks.assignments.mockResolvedValue([assignment(1),assignment(2)]);
    mocks.parts.mockResolvedValue([part(1)]);
    expect((await POST(req(body))).status).toBe(422);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it('requires the registered running/standstill task instead of guessing operating state', async () => {
    expect((await POST(req({...body,equipmentState:'paused'}))).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it('does not allow unsupplied instrument thresholds or visual criteria', async () => {
    expect((await POST(req({...body,parameters:[{...temp,max:null}]}))).status).toBe(400);
    expect((await POST(req({...body,parameters:[{
      key:'corrosion',name:'Corrosion',method:'visual',unit:'',min:null,max:null,acceptance:'',
    }]}))).status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
  it('supports the complete 50-part two-task scenario in two verified batches', async () => {
    const fifty = Array.from({length:50},(_,i)=>part(i+1));
    mocks.parts.mockResolvedValue(fifty.slice(0,22));
    mocks.assignments.mockResolvedValue(fifty.slice(0,22).map((_,i)=>assignment(i+1)));
    let result = await POST(req({...body,componentIds:fifty.slice(0,22).map(p=>p.id)}));
    expect(result.status).toBe(200);
    expect((await result.json()).data.created).toBe(22);
    mocks.createPoint.mockClear();
    mocks.parts.mockResolvedValue(fifty.slice(22));
    mocks.assignments.mockResolvedValue(fifty.slice(22).map((_,i)=>({
      ...assignment(i+23),pmTaskId:'task-vib',pmTask:{id:'task-vib',taskNumber:2,description:'Vibration & sound'},
    })));
    result=await POST(req({...body,pmTaskId:'task-vib',componentIds:fifty.slice(22).map(p=>p.id),
      parameters:[
        {key:'vibration',name:'Vibration',method:'measurement',unit:'mm/s',min:null,max:4.5,acceptance:''},
        {key:'sound',name:'Sound',method:'measurement',unit:'dB(A)',min:null,max:85,acceptance:''},
      ]}));
    expect(result.status).toBe(200);
    expect((await result.json()).data.created).toBe(56);
  });
});
