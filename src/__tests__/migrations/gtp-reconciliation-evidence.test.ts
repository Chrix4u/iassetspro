import { describe, expect, it } from 'vitest';
import { rankGtpHistoricalEvidence } from '@/services/migrations/gtpReconciliationEvidence.service';

describe('GTP historical reconciliation evidence ranking', () => {
  it('rejects weak one-term matches and ranks stronger historical evidence first', () => {
    const suggestions = rankGtpHistoricalEvidence(
      {
        description: 'RSP main pump leakage at waste water treatment plant',
        trade: 'Mechanical',
        workOrderType: 'Breakdown',
      },
      [
        {
          workOrderNo: '1001',
          equipmentCode: '469/1',
          description: 'Repair RSP main pump at waste water treatment plant',
          trade: 'Mechanical',
          workOrderType: 'Breakdown',
        },
        {
          workOrderNo: '1002',
          equipmentCode: '511/1',
          description: 'Inspect treatment plant lighting',
          trade: 'Electrical',
          workOrderType: 'Inspection',
        },
      ],
    );

    expect(suggestions[0]?.equipmentCode).toBe('469/1');
    expect(suggestions.some((candidate) => candidate.equipmentCode === '511/1')).toBe(false);
    expect(suggestions[0]?.sharedTerms).toEqual(expect.arrayContaining(['rsp', 'main', 'pump']));
  });

  it('groups repeated supporting rows by equipment code', () => {
    const suggestions = rankGtpHistoricalEvidence(
      { description: 'chock thickener preparation line', trade: 'Mechanical' },
      [
        { workOrderNo: '2001', equipmentCode: '341/1', description: 'chock thickener line on preparation m/c', trade: 'Mechanical' },
        { workOrderNo: '2002', equipmentCode: '341/1', description: 'repair thickener preparation line chock', trade: 'Mechanical' },
        { workOrderNo: '2003', equipmentCode: '999/1', description: 'repair boiler burner', trade: 'Mechanical' },
      ],
    );

    expect(suggestions[0]).toMatchObject({ equipmentCode: '341/1', supportCount: 2 });
    expect(suggestions[0]?.examples).toHaveLength(2);
  });

  it('caps the result set and exposes a similarity score rather than a probability', () => {
    const suggestions = rankGtpHistoricalEvidence(
      { description: 'motor pump bearing coupling alignment', trade: 'Mechanical', workOrderType: 'Breakdown' },
      [
        { workOrderNo: '1', equipmentCode: 'A', description: 'motor pump bearing coupling alignment', trade: 'Mechanical', workOrderType: 'Breakdown' },
        { workOrderNo: '2', equipmentCode: 'B', description: 'motor pump bearing coupling repair', trade: 'Mechanical', workOrderType: 'Breakdown' },
        { workOrderNo: '3', equipmentCode: 'C', description: 'motor pump bearing alignment', trade: 'Mechanical', workOrderType: 'Breakdown' },
        { workOrderNo: '4', equipmentCode: 'D', description: 'motor pump coupling alignment', trade: 'Mechanical', workOrderType: 'Breakdown' },
      ],
      3,
    );

    expect(suggestions).toHaveLength(3);
    expect(suggestions[0]?.matchScore).toBeLessThanOrEqual(0.99);
    expect(suggestions[0]?.matchScore).toBeGreaterThan(suggestions[2]?.matchScore ?? 0);
  });
});
