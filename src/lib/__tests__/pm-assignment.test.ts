import { describe, expect, it } from 'vitest';
import {
  PM_ACTIVITY_MODES,
  PM_ASSIGNMENT_TYPES,
  PM_INSPECTION_TYPES,
  normalizePmInspectionType,
} from '@/lib/pm-assignment';

describe('PM direct assignment domain', () => {
  it('exposes the meeting PM and activity types', () => {
    expect(PM_ASSIGNMENT_TYPES).toEqual(['tbm', 'ubm', 'cbm', 'fbm']);
    expect(PM_ACTIVITY_MODES).toEqual(['inspection', 'lubrication', 'servicing', 'replacement']);
    expect(PM_INSPECTION_TYPES).toEqual(['running', 'standstill']);
  });

  it('normalizes legacy stopped inspection state to standstill', () => {
    expect(normalizePmInspectionType('stopped')).toBe('standstill');
    expect(normalizePmInspectionType('standstill')).toBe('standstill');
    expect(normalizePmInspectionType('running')).toBe('running');
  });

  it('rejects unsupported inspection states rather than silently changing them', () => {
    expect(normalizePmInspectionType('shutdown')).toBeNull();
    expect(normalizePmInspectionType('')).toBeNull();
    expect(normalizePmInspectionType(null)).toBeNull();
  });
});
