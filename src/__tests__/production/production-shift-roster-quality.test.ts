import { describe,it,expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseProductionSurveyInput } from '@/lib/production-shift-survey';
import { isAssignedCrew,validateCrewSelection } from '@/lib/production-shift-access';

const text=(file:string)=>readFileSync(file,'utf8');
const input={
 assetId:'machine-1',shiftTemplateId:'morning-1',productionDate:'2026-11-18',
 outputQuantity:20,defectiveQuantity:3,startDelayMinutes:10,
 unit:'pieces',availableMinutes:480,
 breakMinutes:30,repairMinutes:20,inputDeliveryMinutes:0,changeoverMinutes:0,
 startupCleaningMinutes:0,otherMinutes:0,preventiveMinutes:0,
};
describe('production survey shift crew, defects and product safety',()=>{
 it('counts defective units within gross and validates delay',()=>{
   const parsed=parseProductionSurveyInput(input);
   expect(parsed.defectiveQuantity).toBe(3);
   expect(parsed.outputQuantity-parsed.defectiveQuantity).toBe(17);
   expect(parsed.startDelayMinutes).toBe(10);
   expect(()=>parseProductionSurveyInput({...input,defectiveQuantity:21})).toThrow('cannot exceed');
   expect(()=>parseProductionSurveyInput({...input,defectiveQuantity:-1})).toThrow();
   expect(()=>parseProductionSurveyInput({...input,startDelayMinutes:5.5})).toThrow('whole minutes');
 });
 it('enforces unique assigned users and one selected leader',()=>{
   expect(validateCrewSelection(['operator1','operator2']).userIds).toEqual(['operator1','operator2']);
   expect(()=>validateCrewSelection(['operator1','operator1'])).toThrow('cannot appear twice');
   expect(()=>validateCrewSelection([])).toThrow('Assign 1');
   expect(isAssignedCrew([{userId:'operator1'}],'operator2')).toBe(false);
 });
 it('guards POST and correction on the server, not merely the UI',()=>{
   const create=text('src/app/api/production-surveys/route.ts');
   const update=text('src/app/api/production-surveys/[id]/route.ts');
   const plans=text('src/app/api/production-surveys/plans/route.ts');
   expect(create).toContain('productionShiftAssignment.findUnique');
   expect(update).toContain('productionShiftAssignment.findUnique');
   expect(plans).toContain('productionShiftAssignment.createMany');
   expect(plans).toContain('leaderUserId');
   expect(plans).toContain('existingRecord');
   expect(create).toContain('planId:plan.id');
   expect(create).toContain('productCode:plan.productCode');
   expect(update).toContain('assignedCount>0');
   expect(text('src/app/api/production-surveys/setup/route.ts'))
     .toContain('records:{some:{recordedById:session.userId}}');
   expect(text('src/app/api/production-surveys/report/route.ts'))
     .toContain('recordedById:session.userId');
 });
 it('reports approved gross, defects, good output and actual meter totals separately',()=>{
   const report=text('src/app/api/production-surveys/report/route.ts');
   expect(report).toContain('for(const plan of scheduled)');
   expect(report).toContain('approvedOutputReported:item.shifts>0');
   expect(report).toContain('targetAchievementPct:item.shifts>0');
   expect(report).toContain('goodOutput:item.output-item.defects');
   expect(report).toContain('defectRatePct:');
   expect(report).toContain('meterLinkedOutput');
   expect(report).toContain("status:'approved'");
 });
});
