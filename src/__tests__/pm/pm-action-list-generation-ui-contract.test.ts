import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
const sheet = readFileSync('src/components/modules/pm/PmMachineInspectionPrint.tsx','utf8');
const panel = readFileSync('src/components/modules/pm/PmMachineInspectionChecklistPanel.tsx','utf8');
const setup = readFileSync('src/components/modules/pm/PmActionListParameterSetup.tsx','utf8');
const rows = readFileSync('src/lib/pm-machine-field-worksheet.ts','utf8');

describe('printed Action List and engineer-approved part parameters', () => {
  it('uses ACTION LIST as the technician print document name, preserving hierarchy and actual recording spaces', () => {
    expect(sheet).toContain('ACTION LIST — {data.equipmentState');
    expect(sheet).toContain('Action List reference:');
    expect(sheet).toContain('<th>BLOCK</th><th>PART</th><th>V.PART</th><th>GT CODE</th><th>DESCRIPTION</th>');
    expect(sheet).toContain('INDUSTRIAL_INSPECTION_COLUMNS.map');
    expect(sheet).toContain('pm-paper-writing-line');
    expect(sheet).toContain('<th>REMARK</th><th>TIME</th>');
    expect(sheet).toContain('Inspector name/signature:');
  });
  it('lets planners assign reusable temperature/vibration/sound/corrosion controls, without guessing limits', () => {
    expect(setup).toContain('Assign Action List parameters to machine parts');
    expect(setup).toContain('Select eligible on page');
    expect(setup).toContain('approved maximum');
    expect(setup).toContain('Acceptable visual condition');
    expect(setup).toContain('existing part has different limits');
    expect(setup).toContain('configuredParameterText');
    expect(setup).toContain('Configured parameters / approved limits');
    expect(panel).toContain('Assign Parameters & Limits');
    expect(panel).toContain('Print Blank Action List');
    expect(rows).toContain('actionListAcceptance(point.normalRange)');
    expect(rows).toContain("point.inspectionType === 'visual' ? 'Visual'");
  });
});
