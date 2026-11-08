import { describe, expect, it } from 'vitest';
import { wrapSchematicLabel } from '@/lib/machine-schematic-label';

describe('wrapSchematicLabel', () => {
  it('preserves every word of long machine and component names without ellipses', () => {
    const fullName = 'Centrifugal Water Pump P-01 UI UAT · Pump and Casing Assembly';
    const lines = wrapSchematicLabel(fullName, 27);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join(' ')).toBe(fullName);
    expect(lines.every((line) => line.length <= 27)).toBe(true);
    expect(lines.some((line) => line.includes('…'))).toBe(false);
  });

  it('breaks even a long unspaced equipment reference without dropping characters', () => {
    const code = 'P01-EXTREMELY-LONG-UNBROKEN-COMPONENT-IDENTIFIER-WITH-SUFFIX';
    const lines = wrapSchematicLabel(code, 20);
    expect(lines.every((line) => line.length <= 20)).toBe(true);
    expect(lines.join('')).toBe(code);
  });

  it('normalizes repeated whitespace and leaves short labels unchanged', () => {
    expect(wrapSchematicLabel(' Pump   & Casing   Assembly  ', 30)).toEqual(['Pump & Casing Assembly']);
    expect(wrapSchematicLabel('Bearing', 26)).toEqual(['Bearing']);
    expect(wrapSchematicLabel('  ', 27)).toEqual(['—']);
  });
});
