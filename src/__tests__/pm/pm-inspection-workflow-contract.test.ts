import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function source(path: string) { return readFileSync(resolve(process.cwd(), path), 'utf8'); }

const route = source('src/app/api/pm-inspections/route.ts');
const panel = source('src/components/modules/pm/PmInspectionListPanel.tsx');
const planning = source('src/components/modules/pm/PmPlanningPage.tsx');
const proxy = source('src/proxy.ts');
const closure = source('src/services/workOrderClosure.service.ts');
const recurrence = source('src/services/pm/advancePmScheduledTaskRecurrence.service.ts');
const assignmentApi = source('src/app/api/pm-assignments/route.ts');
const assignmentList = source('src/components/modules/pm/PmAssignmentTargetList.tsx');

describe('PM inspection-to-corrective-work-order integration contracts', () => {
  it('restricts both listing and recording to authenticated plant-scoped actors', () => {
    expect(route).toContain('getSession(request)');
    expect(route).toContain('getPlantScope(request, session)');
    expect(route).toContain('canAccessPlantStrict(scope, plantId)');
    expect(route).toContain('canAccessPlantStrict(scope, assignment.asset.plantId)');
    expect(route).toContain('canRecord(session)');
    expect(proxy).toContain("prefix: '/api/pm-inspections', modules: ['pm_schedules']");
  });

  it('builds list from active PM inspection assignments with exact machine-part inspection points', () => {
    expect(route).toContain("activityMode: 'inspection'");
    expect(route).toContain('inspectionPoints:');
    expect(route).toContain('records: { orderBy:');
    expect(route).toContain('componentId: assignment.componentId!');
    expect(panel).toContain('PM Inspection List');
    for (const label of ['Machine', 'Department', 'Part', 'Method', 'PM Due', 'Latest Result']) {
      expect(panel).toContain('label="' + label + '"');
    }
    expect(planning).toContain('<PmInspectionListPanel');
  });

  it('serializes repeated records, audits outcomes, and creates no second open corrective WO for a point', () => {
    expect(route).toContain('pg_advisory_xact_lock');
    expect(route).toContain('requestKey');
    expect(route).toContain("entityType: 'component_inspection_record'");
    expect(route).toContain('status: { notIn: CLOSED_STATUSES }');
    expect(route).toContain("const CLOSED_STATUSES = ['closed', 'cancelled'];");
    expect(route).toContain("type: 'corrective'");
    expect(route).toContain("status: 'draft'");
    expect(route).toContain('workOrderComponents: { create:');
    expect(route).toContain('taskExecutions: { create:');
  });

  it('does not advance PM cadence on a corrective inspection WO', () => {
    expect(route).toContain('This corrective WO does not reset PM recurrence');
    expect(route).not.toContain('pmScheduleTaskId:');
    expect(route).not.toContain('pmDueCycleKey:');
    expect(closure).toContain('advanceClosedPmScheduledTaskRecurrence');
    expect(recurrence).toContain("execution.status !== 'completed'");
    expect(recurrence).toContain('nextDueDate');
    expect(recurrence).toContain('nextDueReading');
  });

  it('shows open generated work orders next to due state without treating technician completion as closure', () => {
    expect(assignmentApi).toContain("where: { workOrder: { status: { notIn: ['closed', 'cancelled'] } } }");
    expect(assignmentApi).toContain('taskExecutions:');
    expect(assignmentList).toContain('openOrderMap');
    expect(assignmentList).toContain('order.woNumber');
    expect(assignmentList).toContain('titleCase(order.status)');
  });

  it('does not introduce Event/Condition as an inspection frequency', () => {
    expect(panel).toContain('No third schedule frequency is added');
    expect(route).toContain("frequency: 'per_start'");
  });
});
