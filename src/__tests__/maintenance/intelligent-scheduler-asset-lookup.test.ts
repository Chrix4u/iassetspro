import { describe, expect, it, beforeEach, vi } from 'vitest';

const mocked=vi.hoisted(()=>({
  workOrderFindMany:vi.fn(),
  assetFindMany:vi.fn(),
  userFindMany:vi.fn(),
  logError:vi.fn(),
}));
vi.mock('@/lib/db',()=>({db:{
  workOrder:{findMany:mocked.workOrderFindMany},
  asset:{findMany:mocked.assetFindMany},
  user:{findMany:mocked.userFindMany},
}}));
vi.mock('@/lib/logger',()=>({createLogger:()=>({error:mocked.logError})}));

import { IntelligentSchedulingService } from '@/services/intelligentScheduling.service';

const wo={
  id:'wo1',title:'Critical Pump mechanical inspection',
  assetId:'pump1',assetName:'Old snapshot',
  status:'planned',priority:'high',createdAt:new Date('2026-11-01T00:00:00Z'),
  estimatedHours:4,plannedStart:null,plannedEnd:null,
};

describe('PM schedule optimizer uses actual plant asset records without invalid Prisma include',()=>{
  beforeEach(()=>{
    vi.clearAllMocks();
    mocked.workOrderFindMany.mockResolvedValue([wo]);
    mocked.assetFindMany.mockResolvedValue([{
      id:'pump1',name:'Actual Pump',condition:'poor',criticality:'critical',
    }]);
    mocked.userFindMany.mockResolvedValue([{
      id:'tech1',fullName:'Technical Lead',
    }]);
  });
  it('retains the registered plant asset name, condition and urgency in scheduling recommendations',async()=>{
    const result=await IntelligentSchedulingService.optimizeSchedule('plant1',7);
    expect(mocked.workOrderFindMany).toHaveBeenCalledWith(
      expect.objectContaining({where:expect.objectContaining({plantId:'plant1'})}),
    );
    expect(mocked.assetFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where:{id:{in:['pump1']},plantId:'plant1'},
    }));
    expect(result.scheduledCount).toBe(1);
    expect(result.recommendations[0].assetName).toBe('Actual Pump');
    expect(result.recommendations[0].priority).toBeGreaterThan(7);
    expect(result.recommendations[0].reasoning).toContain('Critical asset');
  });
  it('does not invent asset information when the referenced asset is unavailable',async()=>{
    mocked.assetFindMany.mockResolvedValue([]);
    const result=await IntelligentSchedulingService.optimizeSchedule('plant1',7);
    expect(result.recommendations[0].assetName).toBe('Old snapshot');
    expect(mocked.logError).not.toHaveBeenCalled();
  });
});
