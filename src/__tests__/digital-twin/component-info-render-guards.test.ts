import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync('src/components/digital-twin/ComponentInfoPanel.tsx', 'utf8');

describe('ComponentInfoPanel render guards', () => {
  it('normalizes conditional values before rendering React children', () => {
    expect(source).toContain('const showOperatingMetrics = operatingHours > 0 || daysSinceInspection !== null;');
    expect(source).toContain('{showOperatingMetrics ? (');
    expect(source).toContain("const description = typeof asset.description === 'string' ? asset.description.trim() : '';");
    expect(source).toContain('{description ? (');
    expect(source).toContain('const isOverdue = Boolean(dueDate) &&');
    expect(source).toContain('{device.lastReadingAt != null && (');
    expect(source).not.toContain('asset.description && String(asset.description).length > 0');
    expect(source).not.toContain('const isOverdue = dueDate &&');
    expect(source).not.toContain('{device.lastReadingAt && (');
  });
});
