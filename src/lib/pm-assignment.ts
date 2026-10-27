export const PM_ASSIGNMENT_TYPES = ['tbm', 'ubm', 'cbm', 'fbm'] as const;
export const PM_ACTIVITY_MODES = ['inspection', 'lubrication', 'servicing', 'replacement'] as const;
export const PM_INSPECTION_TYPES = ['running', 'standstill'] as const;
export const PM_ASSIGNMENT_BASES = ['calendar', 'meter'] as const;

export type PmAssignmentType = (typeof PM_ASSIGNMENT_TYPES)[number];
export type PmActivityMode = (typeof PM_ACTIVITY_MODES)[number];
export type PmInspectionType = (typeof PM_INSPECTION_TYPES)[number];
export type PmAssignmentBasis = (typeof PM_ASSIGNMENT_BASES)[number];

export function normalizePmInspectionType(value: unknown): PmInspectionType | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'running') return 'running';
  if (normalized === 'standstill' || normalized === 'stopped') return 'standstill';
  return null;
}
