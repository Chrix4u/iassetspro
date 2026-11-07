import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { classifyInspection, inspectionDueState, parseInspectionRange, isCorrectiveInspectionResult } from '@/lib/pm-inspection-policy';

describe('PM machine-part inspection policy', () => {
  it('supports a defined normal instrument range and its unit', () => {
    expect(parseInspectionRange('{"min":20,"max":80,"unit":"°C"}')).toEqual({ min: 20, max: 80, unit: '°C' });
    expect(parseInspectionRange('{"min":80,"max":20}')).toBeNull();
  });

  it('forces instrument outliers to Fail despite a manually selected Pass', () => {
    const reading = classifyInspection({
      method: 'measurement', requestedResult: 'pass', value: 95,
      normalRange: '{"min":20,"max":80,"unit":"°C"}',
    });
    expect(reading.result).toBe('fail');
    expect(reading.exceededLimit).toBe(true);
    expect(isCorrectiveInspectionResult(reading.result)).toBe(true);
  });

  it('requires a numeric reading for instruments, while sight inspections can be descriptive', () => {
    expect(() => classifyInspection({ method: 'measurement', requestedResult: 'pass', value: '' }))
      .toThrow('numeric instrument reading');
    expect(classifyInspection({ method: 'visual', requestedResult: 'conditional' }).result).toBe('conditional');
  });

  it('does not generate corrective work for Pass or a monitoring-only Conditional result', () => {
    expect(isCorrectiveInspectionResult('pass')).toBe(false);
    expect(isCorrectiveInspectionResult('conditional')).toBe(false);
    expect(isCorrectiveInspectionResult('needs_attention')).toBe(true);
    expect(isCorrectiveInspectionResult('fail')).toBe(true);
  });

  it('classifies both calendar-based and meter-based PM due points', () => {
    const now = new Date('2026-11-07T00:00:00Z');
    expect(inspectionDueState({ basis: 'calendar', nextDueDate: '2026-11-01T00:00:00Z', nextDueReading: null, currentMeterValue: null, now })).toBe('overdue');
    expect(inspectionDueState({ basis: 'calendar', nextDueDate: '2026-11-11T00:00:00Z', nextDueReading: null, currentMeterValue: null, now })).toBe('due_soon');
    expect(inspectionDueState({ basis: 'meter', nextDueDate: null, nextDueReading: 1000, currentMeterValue: 1010, now })).toBe('meter_due');
    expect(inspectionDueState({ basis: 'meter', nextDueDate: null, nextDueReading: 1000, currentMeterValue: 850, now })).toBe('meter_waiting');
  });
});

describe('PM inspection lifecycle contracts', () => {
  const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
  const route = source('src/app/api/pm-inspections/route.ts');
  const planning = source('src/components/modules/pm/PmPlanningPage.tsx');
  const checklist = source('src/components/modules/pm/PmInspectionChecklistPanel.tsx');
  const closure = source('src/services/workOrderClosure.service.ts');

  it('applies strict plant scope and exact component matching before inspection writes', () => {
    expect(route).toContain('getPlantScope(request, session)');
    expect(route).toContain('canAccessPlantStrict(scope, assignment.asset.plantId)');
    expect(route).toContain('assignment.component.assetId !== assignment.assetId');
    expect(route).toContain("componentId: assignment.componentId, isActive: true");
  });

  it('serializes defect work order creation and protects idempotent record submissions', () => {
    expect(route).toContain('pg_advisory_xact_lock');
    expect(route).toContain('componentInspectionRecord.findUnique({ where: { id: submissionId } })');
    expect(route).toContain('status: { notIn: CLOSED_WO_STATES }');
    expect(route).toContain("status: 'draft'");
    expect(route).toContain("type: 'corrective'");
    expect(route).toContain('openByPoint');
    expect(checklist).toContain('row.openCorrective');
  });

  it('does not reset PM due dates merely because an inspection result was recorded', () => {
    const writes = route.split('export async function POST')[1];
    expect(writes).not.toContain('pmScheduleTask.update(');
    expect(writes).not.toContain('nextDueReading:');
    expect(writes).toContain('lastInspected: inspectedAt');
    expect(closure).toContain('advanceClosedPmScheduledTaskRecurrence');
  });

  it('mounts inspection filters and gives the planner a confirmed due-generation action', () => {
    expect(planning).toContain('<PmInspectionChecklistPanel />');
    expect(planning).toContain("'/api/pm-schedules/check-due'");
    expect(planning).toContain('Generate Due PM Work Orders');
    for (const label of ['Machine', 'Part', 'Inspection Method', 'Due State', 'Outcome']) {
      expect(checklist).toContain('label="' + label + '"');
    }
    expect(checklist).toContain("crypto.randomUUID()");
    expect(checklist).toContain("isInstrument(active.method)");
  });
});
