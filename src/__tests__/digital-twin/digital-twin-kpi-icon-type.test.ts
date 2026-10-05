import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = fs.readFileSync('src/components/digital-twin/DigitalTwinMainPage.tsx', 'utf8');

describe('Digital Twin KPI icon typing', () => {
  it('uses LucideIcon for KPI card icons', () => {
    expect(source).toContain('type LucideIcon');
    expect(source).toContain('icon: LucideIcon;');
    expect(source).not.toContain('icon: React.ElementType;');
  });
});
