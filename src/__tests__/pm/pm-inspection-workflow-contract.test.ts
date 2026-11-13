import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const file = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const planner = file('src/components/modules/pm/PmPlanningPage.tsx');
const worksheet = file('src/components/modules/pm/PmInspectionWorksheetPanel.tsx');
const workspaces = file('src/components/modules/pm/PmWorkspacePages.tsx');
const groupedReadings = file('src/components/modules/pm/PmGroupedReadingsPage.tsx');
const listRoute = file('src/app/api/pm-inspections/route.ts');
const scheduledRoute = file('src/app/api/pm-inspections/scheduled/route.ts');
const entryRoute = file('src/app/api/pm-inspections/[pointId]/records/route.ts');
const oldEntry = file('src/app/api/component-registry/[id]/inspections/route.ts');
const closeout = file('src/services/workOrderClosure.service.ts');
const gate = file('src/proxy.ts');
const schema = file('prisma/schema.prisma');

describe('PM inspection lifecycle integration contracts', () => {
  it('exposes a filtered list of existing PM tasks and planned part inspection points', () => {
    // The widget moved out of the compact PM Schedules page into Action Lists.
    expect(planner).not.toContain('<PmInspectionWorksheetPanel />');
    expect(workspaces).toContain('<PmInspectionWorksheetPanel mode="action-lists"/>');
    expect(workspaces).toContain('<PmGroupedReadingsPage />');
    expect(groupedReadings).toContain('groupInspectionPoints(rows)');
    expect(worksheet).toContain('Plan Inspection');
    expect(worksheet).toContain('Record Inspection');
    expect(worksheet).toContain('Generate List');
    expect(worksheet).toContain('Part / Instrument');
    expect(scheduledRoute).toContain("activityMode: 'inspection'");
    expect(scheduledRoute).toContain('nextDueReading');
    expect(listRoute).toContain('getPlantScope(request, session)');
  });

  it('shows an unresolved corrective WO after a later pass without broadening plant access', () => {
    expect(listRoute).toContain("const followUp = q.get('followUp')");
    expect(listRoute).toContain("followUp === 'open'");
    expect(listRoute).toContain("followUp === 'none'");
    expect(listRoute).toContain("status: { notIn: ['closed', 'cancelled'] }");
    expect(listRoute).toContain('inspectionPointId: { in: points.map((point) => point.id) }');
    expect(listRoute).toContain('openCorrectiveWorkOrder: openCorrectiveByPoint.get(point.id) || null');
    expect(worksheet).toContain('Corrective follow-up');
    expect(worksheet).toContain('point.openCorrectiveWorkOrder');
    expect(worksheet).toContain('Next inspection remains due until verified planner closeout.');
  });

  it('exports only the displayed, filtered worksheet page to a spreadsheet-safe CSV', () => {
    expect(worksheet).toContain('buildPmInspectionPageCsv(rows)');
    expect(worksheet).toContain('Export Page CSV');
    expect(worksheet).toContain('rows.length === 0');
  });

  it('records measured values as condition history and does not invent instrument readings', () => {
    expect(entryRoute).toContain('evaluateInspectionResult');
    expect(entryRoute).toContain('componentConditionReading.create');
    expect(entryRoute).not.toContain('pmScheduleTask.update');
    expect(entryRoute).not.toContain('nextDueDate:');
    expect(worksheet).toContain('Measured value');
    expect(worksheet).toContain('Minimum acceptable');
    expect(worksheet).toContain('Maximum acceptable');
  });

  it('only advances passed sight/instrument inspection immediately; a failed check creates a deduplicated draft WO', () => {
    expect(entryRoute).toContain('if (!inspection.isAlarm && !workOrder)');
    expect(entryRoute).toContain('} else if (!inspection.isAlarm) {');
    expect(entryRoute).toContain('awaitingCloseout: Boolean(workOrder)');
    expect(entryRoute).toContain("status: { notIn: ['closed', 'cancelled'] }");
    expect(entryRoute).toContain("type: 'corrective'");
    expect(entryRoute).toContain("status: 'draft'");
    expect(entryRoute).toContain('workOrderId: created.id');
    expect(entryRoute).toContain('pg_advisory_xact_lock');
  });

  it('deduplicates mobile retries before writing inspections, readings or work orders', () => {
    expect(schema).toMatch(/requestKey\s+String\?\s+@unique\s+@map\("request_key"\)/);
    expect(entryRoute).toContain('componentInspectionRecord.findUnique');
    expect(entryRoute).toContain('isSameInspectionSubmission');
    expect(entryRoute).toContain('requestKey: submissionKey || null');
    expect(worksheet).toContain('crypto.randomUUID()');
    expect(worksheet).toContain("requestKey: ''");
  });

  it('resets a failed inspection due only after the verified authoritative closeout', () => {
    expect(closeout).toContain('await advanceClosedInspectionPoint({');
    expect(closeout).toContain('await advanceClosedPmScheduledTaskRecurrence({');
    expect(oldEntry).toContain('recordPmInspection(delegatedRequest');
    expect(oldEntry).not.toContain('nextInspection: nextInspectionDate');
    expect(schema).toMatch(/inspectionTriggerRecord\s+ComponentInspectionRecord\?/);
    expect(gate).toContain("{ prefix: '/api/pm-inspections', modules: ['pm_schedules'] }");
  });
});
