import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks=vi.hoisted(()=>({
  session:vi.fn(), scope:vi.fn(), canAccess:vi.fn(),
  original:vi.fn(), assetLookup:vi.fn(), shiftLookup:vi.fn(), transaction:vi.fn(),
}));
vi.mock('@/lib/auth',()=>({
  getSession:mocks.session,hasPermission:()=>true,isAdmin:()=>false,
}));
vi.mock('@/lib/plant-scope',()=>({
  getPlantScope:mocks.scope,canAccessPlantStrict:mocks.canAccess,
}));
vi.mock('@/lib/production-shift-access',()=>({
  requiresCrewScope:()=>true,
}));
vi.mock('@/lib/db',()=>({db:{
  productionShiftRecord:{findUnique:mocks.original},
  asset:{findUnique:mocks.assetLookup},
  productionShiftTemplate:{findFirst:mocks.shiftLookup},
  $transaction:mocks.transaction,
}}));

import { PUT } from '@/app/api/production-surveys/[id]/route';

const base={
  assetId:'asset-A',
  shiftTemplateId:'morning',
  productionDate:'2026-11-18',
  unit:'yards',
  outputQuantity:100,
  defectiveQuantity:5,
  availableMinutes:480,
  targetQuantity:150,
};
const context={params:Promise.resolve({id:'record-1'})};
const request=(values:Record<string,unknown>)=>new NextRequest(
  'http://localhost/api/production-surveys/record-1',
  {method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({...base,...values})},
);

describe('rejected production survey corrections preserve scheduled shift identity',()=>{
  beforeEach(()=>{
    vi.clearAllMocks();
    mocks.session.mockReturnValue({userId:'operator-1',roles:['operator']});
    mocks.scope.mockResolvedValue({denyAccess:false,accessiblePlantIds:['plant-A'],isSystemWide:false});
    mocks.canAccess.mockReturnValue(true);
    mocks.original.mockResolvedValue({
      id:'record-1',plantId:'plant-A',assetId:'asset-A',shiftTemplateId:'morning',
      productionDate:new Date('2026-11-18T00:00:00.000Z'),
      status:'rejected',recordedById:'operator-1',
      meterReadingId:null,runtimeMeterReadingId:null,
    });
  });

  it.each([
    [{assetId:'asset-B'},'machine'],
    [{productionDate:'2026-11-17'},'date'],
    [{shiftTemplateId:'night'},'shift'],
  ])('rejects a changed %s without looking up another asset or updating history',async(change)=>{
    const response=await PUT(request(change),context);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/cannot be changed/i);
    expect(mocks.assetLookup).not.toHaveBeenCalled();
    expect(mocks.shiftLookup).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('allows the original operator to correct output on the same scheduled shift',async()=>{
    mocks.assetLookup.mockResolvedValue({id:'asset-A',plantId:'plant-A'});
    mocks.shiftLookup.mockResolvedValue({id:'morning',plantId:'plant-A'});
    const latest={
      id:'record-1',plantId:'plant-A',assetId:'asset-A',shiftTemplateId:'morning',
      productionDate:new Date('2026-11-18T00:00:00.000Z'),
      status:'rejected',recordedById:'operator-1',
      meterReadingId:null,runtimeMeterReadingId:null,
      outputQuantity:90,unit:'yards',
    };
    const tx={
      $executeRawUnsafe:vi.fn().mockResolvedValue(undefined),
      productionShiftRecord:{
        findUnique:vi.fn().mockResolvedValue(latest),
        update:vi.fn().mockImplementation(({data}:{data:Record<string,unknown>})=>
          Promise.resolve({...data,id:'record-1'})),
      },
      productionShiftPlan:{
        findUnique:vi.fn().mockResolvedValue({
          id:'plan-one',unit:'yards',targetQuantity:150,availableMinutes:480,
          productCode:'FABRIC-A',plannedShiftsPerDay:2,shiftHours:8,
          standardUtilizationPct:85,standardSpeed:4,
        }),
      },
      productionShiftAssignment:{findUnique:vi.fn().mockResolvedValue({userId:'operator-1'})},
      auditLog:{create:vi.fn().mockResolvedValue({id:'audit-one'})},
    };
    mocks.transaction.mockImplementation(async(fn:(tx:typeof tx)=>Promise<unknown>)=>fn(tx));
    const response=await PUT(request({targetQuantity:9999,outputQuantity:100,defectiveQuantity:5}),context);
    expect(response.status).toBe(200);
    const body=await response.json();
    expect(body.data).toMatchObject({
      id:'record-1',assetId:'asset-A',shiftTemplateId:'morning',outputQuantity:100,
      targetQuantity:150,unit:'yards',productCode:'FABRIC-A',planId:'plan-one',status:'submitted',
    });
    expect(tx.productionShiftRecord.update).toHaveBeenCalledTimes(1);
    expect(tx.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('rejects a concurrent change to the original scheduled identity within the transaction',async()=>{
    mocks.assetLookup.mockResolvedValue({id:'asset-A',plantId:'plant-A'});
    mocks.shiftLookup.mockResolvedValue({id:'morning',plantId:'plant-A'});
    mocks.transaction.mockImplementation(async(fn:(tx:unknown)=>Promise<unknown>)=>fn({
      $executeRawUnsafe:vi.fn().mockResolvedValue(undefined),
      productionShiftRecord:{findUnique:vi.fn().mockResolvedValue({
        id:'record-1',assetId:'asset-B',shiftTemplateId:'morning',
        productionDate:new Date('2026-11-18T00:00:00.000Z'),
        status:'rejected',recordedById:'operator-1',
        meterReadingId:null,runtimeMeterReadingId:null,
      })},
    }));
    const response=await PUT(request({}),context);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/status changed/i);
  });

  it("rejects an operator trying to modify another operator's rejected record",async()=>{
    mocks.original.mockResolvedValue({
      id:'record-1',plantId:'plant-A',assetId:'asset-A',shiftTemplateId:'morning',
      productionDate:new Date('2026-11-18T00:00:00.000Z'),
      status:'rejected',recordedById:'operator-2',
      meterReadingId:null,runtimeMeterReadingId:null,
    });
    const response=await PUT(request({}),context);
    expect(response.status).toBe(403);
    expect(mocks.assetLookup).not.toHaveBeenCalled();
  });
});