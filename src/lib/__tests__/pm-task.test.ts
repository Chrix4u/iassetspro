import { describe, expect, it } from 'vitest';
import { PM_TASK_TYPES, normalizePmTaskDraft, validatePmTaskBatch } from '@/lib/pm-task';
describe('PM task validation', () => {
  it('has the required canonical types', () => expect(PM_TASK_TYPES).toEqual(['mechanical','electrical','plumbing','lubrication']));
  it('normalizes whitespace/case', () => expect(normalizePmTaskDraft({ description: '  Check motor ', taskType: ' ELECTRICAL ' })).toEqual({ description: 'Check motor', taskType: 'electrical' }));
  it('rejects invalid rows before writes', () => { const v = validatePmTaskBatch([{description:'',taskType:'mechanical'}]); expect(v.rowErrors[0]?.row).toBe(1); expect(v.rowErrors[0]?.messages).toContain('Task description is required'); });
});
