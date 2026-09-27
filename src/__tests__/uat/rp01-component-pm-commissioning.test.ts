import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const script = fs.readFileSync('scripts/commission-rp01-component-pm-uat.ts', 'utf8');

describe('RP-01 component PM commissioning', () => {
  it('is scoped to the UAT rotary printer and component registry', () => {
    expect(script).toContain("assetTag: 'UAT-RP-001'");
    expect(script).toContain('componentRegistry.findUnique');
    expect(script).toContain('component.assetId !== asset.id');
  });
  it('covers mechanical, process, control and safety components', () => {
    for (const code of ['RP01-CMP-MOTOR','RP01-CMP-GEARBOX','RP01-CMP-INKPUMP','RP01-INS-DRYTEMP','RP01-INS-GUARDSW','RP01-CMP-PLC']) {
      expect(script).toContain(code);
    }
  });
  it('is idempotent and auto-generates work orders', () => {
    expect(script).toContain('pmSchedule.findFirst');
    expect(script).toContain('pmSchedule.update');
    expect(script).toContain('autoGenerateWO: true');
  });
});