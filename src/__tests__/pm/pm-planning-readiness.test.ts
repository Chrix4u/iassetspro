import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const servicePath = path.resolve(process.cwd(), 'src/services/pm/planningReadiness.service.ts');

async function loadService() {
  expect(existsSync(servicePath), 'PM planning readiness service should exist').toBe(true);
  return import(pathToFileURL(servicePath).href);
}

describe('PM planning readiness', () => {
  it('summarizes checklist requirements and separates mapped from unresolved resources', async () => {
    const { buildPmPlanningReadiness } = await loadService();

    const result = buildPmPlanningReadiness({
      plannerId: 'planner-1',
      assignedTo: 'tech-1',
      assignedSupervisorId: 'supervisor-1',
      departmentId: 'dept-1',
      requiredSkills: JSON.stringify(['Mechanical', 'Lubrication']),
      requiredTools: JSON.stringify(['Torque wrench', 'Grease gun']),
      suggestedParts: JSON.stringify([
        { itemId: 'part-1', itemName: 'Bearing 6205', itemCode: 'BRG-6205', quantity: 2 },
      ]),
      suggestedTools: JSON.stringify([
        { toolId: 'tool-1', toolName: 'Torque Wrench', toolCode: 'TW-01', quantity: 1 },
      ]),
      tasks: [
        { requiredParts: JSON.stringify(['Bearing 6205', 'Food-grade grease']), estimatedMinutes: 30 },
        { requiredParts: JSON.stringify([{ partName: 'Seal kit', quantity: 1, unit: 'set' }]), estimatedMinutes: 20 },
        { requiredParts: JSON.stringify(['bearing 6205']), estimatedMinutes: null },
      ],
    });

    expect(result.checklist).toEqual({ taskCount: 3, estimatedMinutes: 50 });
    expect(result.requiredSkills).toEqual(['Mechanical', 'Lubrication']);
    expect(result.resources.mappedPartCount).toBe(1);
    expect(result.resources.mappedToolCount).toBe(1);
    expect(result.resources.unresolvedPartLabels).toEqual(['Food-grade grease', 'Seal kit']);
    expect(result.resources.unresolvedToolLabels).toEqual(['Grease gun']);
    expect(result.blockingIssues).toEqual([]);
    expect(result.readyForPlanning).toBe(true);
  });

  it('flags missing accountable planning assignments without treating free-text resources as hard blockers', async () => {
    const { buildPmPlanningReadiness } = await loadService();

    const result = buildPmPlanningReadiness({
      plannerId: 'planner-1',
      assignedTo: null,
      assignedSupervisorId: null,
      departmentId: null,
      requiredSkills: null,
      requiredTools: JSON.stringify(['Insulation tester']),
      suggestedParts: null,
      suggestedTools: null,
      tasks: [{ requiredParts: JSON.stringify(['Fuse 10A']), estimatedMinutes: 15 }],
    });

    expect(result.readyForPlanning).toBe(false);
    expect(result.blockingIssues.map((issue: { code: string }) => issue.code)).toEqual([
      'technician_missing',
      'supervisor_missing',
      'department_missing',
    ]);
    expect(result.warnings.map((warning: { code: string }) => warning.code)).toEqual([
      'unmapped_parts',
      'unmapped_tools',
    ]);
  });

  it('requires an accountable planner even when the execution assignments are otherwise complete', async () => {
    const { buildPmPlanningReadiness } = await loadService();

    const result = buildPmPlanningReadiness({
      plannerId: null,
      assignedTo: 'tech-1',
      assignedSupervisorId: 'supervisor-1',
      departmentId: 'dept-1',
      requiredSkills: null,
      requiredTools: null,
      suggestedParts: null,
      suggestedTools: null,
      tasks: [{ requiredParts: null, estimatedMinutes: 10 }],
    });

    expect(result.readyForPlanning).toBe(false);
    expect(result.blockingIssues.map((issue: { code: string }) => issue.code)).toEqual(['planner_missing']);
  });

  it('fails closed when the canonical Repairs execution module is unavailable', async () => {
    const { buildPmPlanningReadiness } = await loadService();

    const result = buildPmPlanningReadiness({
      plannerId: 'planner-1',
      assignedTo: 'tech-1',
      assignedSupervisorId: 'supervisor-1',
      departmentId: 'dept-1',
      repairsOperational: false,
      requiredSkills: null,
      requiredTools: null,
      suggestedParts: null,
      suggestedTools: null,
      tasks: [{ requiredParts: null, estimatedMinutes: 10 }],
    });

    expect(result.readyForPlanning).toBe(false);
    expect(result.blockingIssues.map((issue: { code: string }) => issue.code)).toEqual(['repairs_module_unavailable']);
  });

  it('warns on a PM work order with no checklist but does not invent a hard requirement', async () => {
    const { buildPmPlanningReadiness } = await loadService();

    const result = buildPmPlanningReadiness({
      plannerId: 'planner-1',
      assignedTo: 'tech-1',
      assignedSupervisorId: 'supervisor-1',
      departmentId: 'dept-1',
      requiredSkills: null,
      requiredTools: null,
      suggestedParts: 'not-json',
      suggestedTools: 'not-json',
      tasks: [],
    });

    expect(result.readyForPlanning).toBe(true);
    expect(result.warnings.map((warning: { code: string }) => warning.code)).toContain('checklist_empty');
    expect(result.resources.unresolvedPartLabels).toEqual([]);
    expect(result.resources.unresolvedToolLabels).toEqual([]);
  });
});
