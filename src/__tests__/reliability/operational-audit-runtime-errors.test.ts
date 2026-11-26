import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
const m=vi.hoisted(()=>({session:vi.fn(),scope:vi.fn(),device:vi.fn(),alert:vi.fn(),reading:vi.fn(),rule:vi.fn(),findDevice:vi.fn(),findAlert:vi.fn(),query:vi.fn()}));
vi.mock('@/lib/auth',()=>({getSession:m.session,isAdmin:()=>true}));
vi.mock('@/lib/plant-scope',()=>({getPlantScope:m.scope,getPlantFilterWhere:(s:{plantId?:string})=>s.plantId?{plantId:s.plantId}:{}}));
vi.mock('@/lib/db',()=>({db:{iotDevice:{count:m.device,findMany:m.findDevice},iotAlert:{count:m.alert,findMany:m.findAlert},iotReading:{count:m.reading},iotAlertRule:{count:m.rule},$queryRaw:m.query}}));
vi.mock('@/lib/logger',()=>({createLogger:()=>({error:vi.fn()})}));
vi.mock('@/services/observability/openTelemetry.service',()=>({OpenTelemetryService:{getStats:()=>({totalSpans:0,maxSpans:100,activeSpans:0,completedTraces:0})}}));
vi.mock('@/services/observability/prometheusMetrics.service',()=>({PrometheusMetricsService:{listMetrics:()=>[],getMetric:()=>null}}));
vi.mock('@/services/observability/centralizedLogging.service',()=>({CentralizedLoggingService:{getStats:()=>({totalEntries:0,errorRate:0})}}));
vi.mock('@/services/observability/persistence.service',()=>({getStatus:()=>({isRunning:false,config:{flushIntervalMs:1000},totalPersisted:{logs:0,traces:0,metrics:0}})}));
import {GET as monitoring} from '@/app/api/iot/monitoring/summary/route';
import {GET as health} from '@/app/api/observability/health/route';
beforeEach(()=>{vi.clearAllMocks();m.session.mockReturnValue({userId:'user'});m.scope.mockResolvedValue({plantId:'plant-a'});for(const f of [m.device,m.alert,m.reading,m.rule])f.mockResolvedValue(0);m.findDevice.mockResolvedValue([]);m.findAlert.mockResolvedValue([]);m.query.mockResolvedValue([{ok:1}]);});
describe('operational audit route regressions',()=>{
 it('scopes IoT devices and their dependent records through the owning device',async()=>{
  const res=await monitoring(new NextRequest('http://localhost/api/iot/monitoring/summary'));
  expect(res.status).toBe(200);
  expect(m.device).toHaveBeenCalledWith({where:expect.objectContaining({plantId:'plant-a'})});
  for(const spy of [m.alert,m.findAlert,m.reading,m.rule]){
   expect(spy).toHaveBeenCalled();
   for(const [arg] of spy.mock.calls){expect(arg.where.device).toEqual({plantId:'plant-a'});expect(arg.where).not.toHaveProperty('plantId');}
  }
 });
 it('denies an unauthorized plant before querying monitoring data',async()=>{
  m.scope.mockResolvedValue({denyAccess:true});
  expect((await monitoring(new NextRequest('http://localhost/api/iot/monitoring/summary'))).status).toBe(403);
  expect(m.device).not.toHaveBeenCalled();
 });
 it('returns actual host load averages and process CPU seconds without crashing',async()=>{
  const res=await health(new NextRequest('http://localhost/api/observability/health'));
  expect(res.status).toBe(200);
  const body=await res.json();
  expect(body.data.system.cpu.loadAvg).toHaveLength(3);
  expect(body.data.system.cpu.usageSeconds.user).toBeGreaterThanOrEqual(0);
  expect(body.data.system.cpu.usageSeconds.system).toBeGreaterThanOrEqual(0);
 });
});
