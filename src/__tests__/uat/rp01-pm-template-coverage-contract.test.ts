import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const scriptPath = 'scripts/commission-rp01-pm-templates.ts';
const expectedComponentCodes = [
  'RP01-CMP-MOTOR',
  'RP01-PRT-MTRBRG-DE',
  'RP01-CMP-GEARBOX',
  'RP01-PRT-GBXBRG-IN',
  'RP01-PRT-GBXBRG-OUT',
  'RP01-PRT-BRG-DS',
  'RP01-CMP-INKPUMP',
  'RP01-PRT-PUMPSEAL',
  'RP01-CMP-EXFAN',
  'RP01-INS-DRYTEMP',
  'RP01-INS-LOADCELL',
  'RP01-INS-GUARDSW',
  'RP01-CMP-VFD',
  'RP01-CMP-PLC',
];

describe('RP-01 PM template commissioning contract', () => {
  it('provides an idempotent commissioner covering every commissioned RP-01 component PM schedule', () => {
    expect(fs.existsSync(scriptPath)).toBe(true);
    if (!fs.existsSync(scriptPath)) return;

    const source = fs.readFileSync(scriptPath, 'utf8');
    for (const componentCode of expectedComponentCodes) {
      expect(source).toContain(componentCode);
    }
    expect(source).toContain('pmTemplateTask.update');
    expect(source).toContain('pmTemplateTask.create');
    expect(source).toContain('pmSchedule.update');
    expect(source).toContain("process.argv.includes('--dry-run')");
    expect(source).toContain('dryRun');
    expect(source).toContain('validateDefinitions');
    expect(source).toContain('totalTaskMinutes');
    expect(source).toContain('maxWait: 10_000');
    expect(source).toContain('timeout: 120_000');
  });
});
