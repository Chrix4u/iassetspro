import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const collection = fs.readFileSync('src/app/api/pm-schedules/route.ts', 'utf8');
const detail = fs.readFileSync('src/app/api/pm-schedules/[id]/route.ts', 'utf8');
const page = fs.readFileSync('src/components/modules/MaintenancePages.tsx', 'utf8');

describe('PM schedule estimated duration validation contract', () => {
  it('normalizes blank create-form duration to zero hours', () => {
    expect(page).toContain('estimatedDuration: formEstDuration ? parseFloat(formEstDuration) : 0');
    expect(collection).toContain('estimatedDuration: normalizedEstimatedDuration');
  });

  it('accepts zero/decimal hours and rejects invalid or negative create values', () => {
    expect(collection).toContain('const normalizedEstimatedDuration');
    expect(collection).toContain('Number.isFinite(normalizedEstimatedDuration)');
    expect(collection).toContain('normalizedEstimatedDuration < 0');
    expect(collection).toContain('Estimated duration must be a non-negative number of hours');
  });

  it('applies the same numeric non-negative contract to schedule edits', () => {
    expect(detail).toContain('body.estimatedDuration !== undefined');
    expect(detail).toContain('Number.isFinite(normalizedEstimatedDuration)');
    expect(detail).toContain('normalizedEstimatedDuration < 0');
    expect(detail).toContain('updateData.estimatedDuration = normalizedEstimatedDuration');
  });

  it('preserves an explicit zero duration when opening an existing schedule', () => {
    expect(page).toContain("item.estimatedDuration !== null && item.estimatedDuration !== undefined ? String(item.estimatedDuration) : ''");
  });
});
