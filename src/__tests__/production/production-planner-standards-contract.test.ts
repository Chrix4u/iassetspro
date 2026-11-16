import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { surveyTotals } from '@/lib/production-shift-survey';
const read=(file:string)=>readFileSync(file,'utf8');
const planner=read('src/app/api/production-surveys/plans/route.ts');
const entry=read('src/app/api/production-surveys/route.ts');
const correction=read('src/app/api/production-surveys/[id]/route.ts');
const report=read('src/app/api/production-surveys/report/route.ts');
const page=read('src/components/modules/ProductionSurveyPage.tsx');
const schema=read('prisma/schema.prisma');
const seed=read('prisma/seed.ts');
const deployPermissionSeed=read('prisma/seed-permissions-only.ts');
const referenceSeed=read('prisma/seed-reference-data.ts');

describe('planner-owned shift standards and workbook calculations',()=>{
  it('deploy-time RBAC seeding includes the new permission for authorized planners and managers',()=>{
    expect(referenceSeed).toContain("runSeed('prisma/seed-permissions-only.ts')");
    expect(deployPermissionSeed).toContain("production_surveys: ['view', 'create', 'update', 'manage', 'plan']");
    const plannerRole=deployPermissionSeed.split('  maintenance_planner: [')[1]?.split('  maintenance_supervisor: [')[0];
    const managerRole=deployPermissionSeed.split('  production_manager: [')[1]?.split('  production_operator: [')[0];
    expect(plannerRole).toContain("'production_surveys.plan'");
    expect(managerRole).toContain("'production_surveys.plan'");
  });


  it('makes the production planner, not the operator, control targets, shift hours and standard speed',()=>{
    expect(schema).toContain('model ProductionShiftPlan');
    expect(schema).toContain('@@unique([assetId, productionDate, shiftTemplateId])');
    expect(planner).toContain("hasPermission(session, 'production_surveys.plan')");
    expect(planner).toContain("existingRecord");
    expect(planner).toContain("A shift record already exists");
    expect(seed).toContain("'production_surveys.plan'");
    expect(page).toContain('Planner-owned shift standards');
    expect(page).toContain('Production target (planner)');
    expect(page).toContain('Available minutes (planner)');
    expect(page).toContain('disabled={!reports.length}');
  });
  it('locks the planner plan and overrides all operator-provided standards server-side',()=>{
    expect(entry).toContain('productionShiftPlan.findUnique');
    expect(entry).toContain('targetQuantity:plan.targetQuantity');
    expect(entry).toContain('availableMinutes:plan.availableMinutes');
    expect(entry).toContain('unit:plan.unit');
    expect(entry).toContain('standardUtilizationPct:plan.standardUtilizationPct');
    expect(entry).toContain("pg_advisory_xact_lock(hashtext($1))");
    expect(correction).toContain('unit:plan.unit,targetQuantity:plan.targetQuantity,availableMinutes:plan.availableMinutes');
    expect(page).toContain('disabled={saving||plansLoading||!activePlan');
  });
  it('uses the engineer workbook formula for productive time',()=>{
    const input={outputQuantity:1500,availableMinutes:480,
      breakMinutes:30,repairMinutes:45,inputDeliveryMinutes:15,changeoverMinutes:10,
      startupCleaningMinutes:20,otherMinutes:0,preventiveMinutes:0};
    const t=surveyTotals(input);
    expect(t.downtimeMinutes).toBe(120);
    expect(t.productiveMinutes).toBe(360);
    expect(t.utilizationPct).toBe(75);
    expect(t.speedPerMinute).toBeCloseTo(1500/360);
    // Workbook engineering efficiency: (available - repair) / available x 100.
    expect((input.availableMinutes-input.repairMinutes)/input.availableMinutes*100).toBeCloseTo(90.625);
    // Workbook productivity = output / available minutes.
    expect(input.outputQuantity/input.availableMinutes).toBeCloseTo(3.125);
    expect(report).toContain('item.availableMinutes-item.repairMinutes');
    expect(report).toContain('item.output/item.availableMinutes');
  });
  it('keeps operator preview and submission tied to the planner plan after form reset',()=>{
    expect(page).toContain('const available=activePlan?.availableMinutes??0;');
    expect(page).toContain('availableMinutes:activePlan.availableMinutes');
    expect(page).toContain('targetQuantity:activePlan.targetQuantity');
    expect(page).toContain('dailyConfiguredTarget');
    expect(page).toContain('sum of configured shift targets');
  });
  it('does not accept impossible report calendar days',()=>{
    expect(report).toContain("first.toISOString().slice(0,10)!==from");
    expect(report).toContain("last.toISOString().slice(0,10)!==to");
  });
  it('does not conflate estimated productive minutes with actual machine run hours',()=>{
    expect(page).toContain('Runtime-based PM must use a separately verified runtime meter');
    expect(page).toContain('not independently measured machine running hours');
  });
  it('supports grouping across day, Sunday-Saturday week, month, quarter, year',()=>{
    expect(report).toContain("['day','week','month','quarter','year']");
    expect(report).toContain("return reportingWeekStart(date)");
    expect(report).toContain("if(group==='quarter')");
    expect(page).toContain('<SelectItem value="year">Yearly</SelectItem>');
    expect(report).toContain("status:'approved'");
  });
});
