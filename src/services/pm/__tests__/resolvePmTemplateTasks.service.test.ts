import { describe, expect, it, vi } from 'vitest';
import { materializePmTemplateTasks } from '@/services/pm/materializePmTemplateTasks.service';
import {
  formatResolvedPmTemplateTaskComment,
  resolvePmTemplateTasks,
} from '@/services/pm/resolvePmTemplateTasks.service';

const stamp = new Date('2026-10-22T00:00:00Z');

function association(overrides: Record<string, unknown> = {}) {
  return {
    id: 'assoc-1',
    templateId: 'template-1',
    pmTaskId: 'master-1',
    taskNumber: 77,
    description: 'Stale copied description',
    taskType: 'check',
    requiredParts: '["Bearing grease"]',
    estimatedMinutes: 20,
    sortOrder: 5,
    isActive: true,
    pmTask: {
      id: 'master-1',
      plantId: 'plant-1',
      taskNumber: 17,
      description: 'Inspect motor terminal tightness',
      taskType: 'electrical',
      isActive: true,
      createdById: 'user-1',
      createdAt: stamp,
      updatedAt: stamp,
    },
    ...overrides,
  };
}

describe('resolvePmTemplateTasks', () => {
  it('uses current Task Master description and discipline for linked associations', () => {
    const [resolved] = resolvePmTemplateTasks([association()]);

    expect(resolved).toEqual(expect.objectContaining({
      associationId: 'assoc-1',
      templateId: 'template-1',
      pmTaskId: 'master-1',
      sequence: 1,
      masterTaskNumber: 17,
      description: 'Inspect motor terminal tightness',
      discipline: 'electrical',
      compatibilityActionType: 'check',
      requiredParts: '["Bearing grease"]',
      estimatedMinutes: 20,
      isLegacy: false,
      masterIsActive: true,
    }));
  });

  it('keeps a null-linked legacy association working from compatibility fields', () => {
    const [resolved] = resolvePmTemplateTasks([association({
      id: 'legacy-1',
      pmTaskId: null,
      taskNumber: 4,
      description: 'Legacy grease coupling',
      taskType: 'lubricate',
      sortOrder: 0,
      pmTask: null,
    })]);

    expect(resolved).toEqual(expect.objectContaining({
      associationId: 'legacy-1',
      pmTaskId: null,
      sequence: 1,
      masterTaskNumber: null,
      description: 'Legacy grease coupling',
      discipline: null,
      compatibilityActionType: 'lubricate',
      isLegacy: true,
      masterIsActive: null,
    }));
  });

  it('derives execution sequence from sortOrder rather than master or compatibility Task Number', () => {
    const resolved = resolvePmTemplateTasks([
      association({ id: 'late', taskNumber: 1, sortOrder: 30, pmTask: { ...association().pmTask, id: 'master-late', taskNumber: 2 }, pmTaskId: 'master-late' }),
      association({ id: 'early', taskNumber: 99, sortOrder: 1, pmTask: { ...association().pmTask, id: 'master-early', taskNumber: 900 }, pmTaskId: 'master-early' }),
    ]);

    expect(resolved.map((task) => ({ id: task.associationId, sequence: task.sequence, masterTaskNumber: task.masterTaskNumber }))).toEqual([
      { id: 'early', sequence: 1, masterTaskNumber: 900 },
      { id: 'late', sequence: 2, masterTaskNumber: 2 },
    ]);
  });

  it('uses stable master identity in comments and a clear legacy fallback', () => {
    const [linked] = resolvePmTemplateTasks([association()]);
    const [legacy] = resolvePmTemplateTasks([association({
      id: 'legacy-1', pmTaskId: null, taskNumber: 8, sortOrder: 0,
      description: 'Legacy inspect guard', taskType: 'inspect', pmTask: null,
    })]);

    expect(formatResolvedPmTemplateTaskComment(linked)).toContain('[Task Master #17]');
    expect(formatResolvedPmTemplateTaskComment(linked)).toContain('[ELECTRICAL]');
    expect(formatResolvedPmTemplateTaskComment(linked)).toContain('[CHECK]');
    expect(formatResolvedPmTemplateTaskComment(legacy)).toContain('[Legacy PM Task #1]');
    expect(formatResolvedPmTemplateTaskComment(legacy)).toContain('[INSPECT]');
  });

  it('materializes immutable execution snapshots using sequence 1..N and resolved descriptions', async () => {
    const createMany = vi.fn().mockResolvedValue({ count: 2 });
    const tx = { workOrderTaskExecution: { createMany } } as any;
    const tasks = resolvePmTemplateTasks([
      association({ id: 'second', sortOrder: 20, pmTask: { ...association().pmTask, id: 'master-2', taskNumber: 33, description: 'Current second' }, pmTaskId: 'master-2' }),
      association({ id: 'first', sortOrder: 10, pmTask: { ...association().pmTask, id: 'master-1', taskNumber: 5, description: 'Current first' }, pmTaskId: 'master-1' }),
    ]);

    await materializePmTemplateTasks(tx, 'wo-1', tasks);

    expect(createMany).toHaveBeenCalledWith({ data: [
      expect.objectContaining({ workOrderId: 'wo-1', templateTaskId: 'first', taskNumber: 1, description: 'Current first', taskType: 'check' }),
      expect.objectContaining({ workOrderId: 'wo-1', templateTaskId: 'second', taskNumber: 2, description: 'Current second', taskType: 'check' }),
    ] });
  });

  it('lets later master edits affect future resolution without mutating an earlier execution snapshot', () => {
    const before = resolvePmTemplateTasks([association()]);
    const executionSnapshot = {
      taskNumber: before[0].sequence,
      description: before[0].description,
      taskType: before[0].compatibilityActionType,
    };
    const after = resolvePmTemplateTasks([association({
      pmTask: { ...association().pmTask, description: 'Revised master description', taskType: 'mechanical' },
    })]);

    expect(after[0].description).toBe('Revised master description');
    expect(after[0].discipline).toBe('mechanical');
    expect(executionSnapshot).toEqual({ taskNumber: 1, description: 'Inspect motor terminal tightness', taskType: 'check' });
  });
});
