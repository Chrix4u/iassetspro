import { describe, expect, it } from 'vitest';
import { filterPmAssignmentTargets, groupPmAssignmentTargets, type PmAssignmentTargetListRecord } from '@/lib/pm-assignment-target-list';
const row=(overrides:Partial<PmAssignmentTargetListRecord>={}):PmAssignmentTargetListRecord=>({id:'a',assetId:'asset',componentId:'part',isActive:true,pmType:'tbm',activityMode:'inspection',equipmentState:'standstill',frequencyInterval:1,frequencyUnit:'days',nextDueDate:'2026-11-01T00:00:00Z',nextDueReading:null,estimatedMinutes:10,leadDays:0,conditionSourceType:null,conditionSourceId:null,conditionMetric:null,conditionOperator:null,conditionThreshold:null,conditionThresholdMax:null,conditionUnit:null,evaluationCadenceMinutes:null,asset:{id:'asset',name:'Machine'},component:{id:'part',name:'Part'},assetMeter:null,pmTask:{id:'task',taskNumber:1,description:'Inspect'},...overrides});
describe('PM due-state consistency contract',()=>{
 it('uses timestamp comparisons for overdue and the next seven days for due-soon',()=>{
  const now=new Date('2026-10-31T12:00:00Z');
  const groups=groupPmAssignmentTargets([row({id:'past',componentId:'p1',component:{id:'p1',name:'Past'},nextDueDate:'2026-10-31T11:59:59Z'}),row({id:'soon',componentId:'p2',component:{id:'p2',name:'Soon'},nextDueDate:'2026-11-07T12:00:00Z'})]);
  expect(filterPmAssignmentTargets(groups,{dueState:'overdue'},now).map(g=>g.targetName)).toEqual(['Past']);
  expect(filterPmAssignmentTargets(groups,{dueState:'due_soon'},now).map(g=>g.targetName)).toEqual(['Soon']);
 });
});
