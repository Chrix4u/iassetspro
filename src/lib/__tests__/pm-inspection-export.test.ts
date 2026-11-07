import { describe, expect, it } from 'vitest';
import { buildPmInspectionPageCsv, type PmInspectionExportRow } from '../pm-inspection-export';

const sample: PmInspectionExportRow = {
  name: 'Motor vibration',
  inspectionType: 'measurement',
  parameterKey: 'vibration',
  normalRange: '{"min":0,"max":5,"unit":"mm/s"}',
  frequency: 'weekly',
  nextInspection: '2026-11-08T08:00:00.000Z',
  dueState: 'upcoming',
  component: {
    name: 'Motor "A", gearbox',
    componentCode: 'M-100',
    asset: { name: 'Production machine', assetTag: 'TAG-01' },
  },
  latestRecord: {
    result: 'pass',
    value: '3.2',
    findings: 'Looks okay',
    inspectedAt: '2026-11-07T08:00:00.000Z',
  },
  openCorrectiveWorkOrder: { woNumber: 'WO-202611-0012', status: 'in_progress' },
};

describe('PM inspection worksheet CSV export', () => {
  it('exports the exact provided page with latest readings and outstanding corrective WO', () => {
    const csv = buildPmInspectionPageCsv([sample]);
    expect(csv.split('\r\n')).toHaveLength(3);
    expect(csv).toContain('"Motor ""A"", gearbox"');
    expect(csv).toContain('"mm/s"');
    expect(csv).toContain('"3.2"');
    expect(csv).toContain('"WO-202611-0012","in_progress"');
    expect(csv).toContain('"2026-11-08T08:00:00.000Z"');
  });

  it('escapes spreadsheet formula prefixes and embedded newlines', () => {
    const csv = buildPmInspectionPageCsv([{
      ...sample,
      name: '=HYPERLINK("malicious")',
      latestRecord: { ...sample.latestRecord!, findings: '@SUM(A1:A9)\nfollow-up' },
    }]);
    expect(csv).toContain('"' + "'=HYPERLINK" + '(""malicious"")"');
    expect(csv).toContain('"' + "'@SUM(A1:A9)" + '\nfollow-up"');
  });

  it('handles malformed limits and empty results', () => {
    expect(buildPmInspectionPageCsv([])).toContain('"Machine","Asset tag"');
    const csv = buildPmInspectionPageCsv([{ ...sample, normalRange: 'not json', latestRecord: null, openCorrectiveWorkOrder: null }]);
    expect(csv).toContain('"Motor vibration"');
    expect(csv).not.toContain('WO-202611-0012');
    expect(csv).not.toContain('undefined');
  });
});
