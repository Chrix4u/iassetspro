import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isInstrumentAlarm } from '@/components/digital-twin/diagram-node-logic';

const source = fs.readFileSync('src/components/digital-twin/DiagramNodeTypes.tsx', 'utf8');

describe('Diagram node icon and alarm contracts', () => {
  it('types asset icons as Lucide icons', () => {
    expect(source).toContain('type LucideIcon');
    expect(source).toContain('const assetTypeIcons: Record<string, LucideIcon>');
    expect(source).not.toContain('const assetTypeIcons: Record<string, React.ElementType>');
  });

  it('evaluates high and low instrument alarms independently', () => {
    expect(isInstrumentAlarm(11, 10, null)).toBe(true);
    expect(isInstrumentAlarm(9, 10, null)).toBe(false);
    expect(isInstrumentAlarm(2, null, 3)).toBe(true);
    expect(isInstrumentAlarm(4, null, 3)).toBe(false);
    expect(isInstrumentAlarm(11, 10, 3)).toBe(true);
    expect(isInstrumentAlarm(2, 10, 3)).toBe(true);
    expect(isInstrumentAlarm(5, 10, 3)).toBe(false);
    expect(isInstrumentAlarm(null, 10, 3)).toBe(false);
    expect(isInstrumentAlarm(5, null, null)).toBe(false);
  });
});
