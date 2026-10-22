export const PM_TASK_TYPES = ['mechanical', 'electrical', 'plumbing', 'lubrication'] as const;
export type PmTaskType = (typeof PM_TASK_TYPES)[number];
export const PM_TASK_TYPE_LABELS: Record<PmTaskType, string> = {
  mechanical: 'Mechanical', electrical: 'Electrical', plumbing: 'Plumbing', lubrication: 'Lubrication',
};
export interface PmTaskDraft { description: string; taskType: string; }
export interface NormalizedPmTaskDraft { description: string; taskType: PmTaskType; }
export interface PmTaskRowError { row: number; messages: string[]; }
export interface PmTaskBatchValidationResult { rows: NormalizedPmTaskDraft[]; rowErrors: PmTaskRowError[]; }

function validateAndNormalize(input: PmTaskDraft): { value?: NormalizedPmTaskDraft; messages: string[] } {
  const messages: string[] = [];
  const description = typeof input?.description === 'string' ? input.description.trim() : '';
  const rawType = typeof input?.taskType === 'string' ? input.taskType.trim().toLowerCase() : '';
  if (!description) messages.push('Task description is required');
  if (!PM_TASK_TYPES.includes(rawType as PmTaskType)) {
    messages.push(`Task type must be one of: ${PM_TASK_TYPES.map((type) => PM_TASK_TYPE_LABELS[type]).join(', ')}`);
  }
  if (messages.length > 0) return { messages };
  return { value: { description, taskType: rawType as PmTaskType }, messages };
}
export function normalizePmTaskDraft(input: PmTaskDraft): NormalizedPmTaskDraft {
  const result = validateAndNormalize(input);
  if (!result.value) throw new Error(result.messages.join('; '));
  return result.value;
}
export function validatePmTaskBatch(rows: PmTaskDraft[]): PmTaskBatchValidationResult {
  if (!Array.isArray(rows) || rows.length === 0) return { rows: [], rowErrors: [{ row: 0, messages: ['At least one task is required'] }] };
  const normalized: NormalizedPmTaskDraft[] = [];
  const rowErrors: PmTaskRowError[] = [];
  rows.forEach((row, index) => {
    const result = validateAndNormalize(row);
    if (result.value) normalized.push(result.value); else rowErrors.push({ row: index + 1, messages: result.messages });
  });
  return { rows: normalized, rowErrors };
}
export class PmTaskBatchValidationError extends Error {
  readonly rowErrors: PmTaskRowError[];
  constructor(rowErrors: PmTaskRowError[]) { super('Task batch validation failed'); this.name = 'PmTaskBatchValidationError'; this.rowErrors = rowErrors; }
}
