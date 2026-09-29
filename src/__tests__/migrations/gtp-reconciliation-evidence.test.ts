import { describe, expect, it } from 'vitest';
import { canDirectlyApplyGtpEvidence, rankGtpHistoricalEvidence } from '@/services/migrations/gtpReconciliationEvidence.service';

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
    const treatmentPlantAlternative = suggestions.find((candidate) => candidate.equipmentCode === '511/1');
    expect(treatmentPlantAlternative).toBeDefined();
    expect(suggestions[0]?.matchScore ?? 0).toBeGreaterThan(treatmentPlantAlternative?.matchScore ?? 0);
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


  it('normalizes legacy morphology and preserves industrial line terminology', () => {
    const suggestions = rankGtpHistoricalEvidence(
      { description: 'Chocked thickener line at colour kitchen', trade: 'Mechanical' },
      [
        { workOrderNo: '3001', equipmentCode: '341/1', description: 'Chock thickener line on thickener preparation m/c', trade: 'Mechanical' },
        { workOrderNo: '3002', equipmentCode: '341/1', description: 'Repair chock on thickener preparation line', trade: 'Mechanical' },
        { workOrderNo: '3003', equipmentCode: '469/1', description: 'Repair pump line at colour kitchen', trade: 'Mechanical' },
      ],
    );

    expect(suggestions[0]?.equipmentCode).toBe('341/1');
    expect(suggestions[0]?.sharedTerms).toEqual(expect.arrayContaining(['chock', 'thickener', 'line']));
  });

  it('allows quick apply only for a dominant, repeatedly-supported top match', () => {
    const safe = [
      { equipmentCode: '469/1', matchScore: 0.86, sharedTerms: ['rsp', 'pump'], supportCount: 5, examples: [] },
      { equipmentCode: '511/1', matchScore: 0.62, sharedTerms: ['treatment', 'plant'], supportCount: 2, examples: [] },
    ];
    expect(canDirectlyApplyGtpEvidence(safe, 0, true)).toBe(true);
    expect(canDirectlyApplyGtpEvidence(safe, 1, true)).toBe(false);

    const ambiguous = [
      { equipmentCode: '381/1', matchScore: 0.97, sharedTerms: ['air', 'leak'], supportCount: 10, examples: [] },
      { equipmentCode: '469/1', matchScore: 0.88, sharedTerms: ['air', 'leak'], supportCount: 12, examples: [] },
    ];
    expect(canDirectlyApplyGtpEvidence(ambiguous, 0, true)).toBe(false);

    const thinEvidence = [
      { equipmentCode: '484/1', matchScore: 0.84, sharedTerms: ['material', 'general'], supportCount: 1, examples: [] },
    ];
    expect(canDirectlyApplyGtpEvidence(thinEvidence, 0, true)).toBe(false);
    expect(canDirectlyApplyGtpEvidence(safe, 0, false)).toBe(false);
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
    expect(suggestions[0]?.matchScore ?? 0).toBeGreaterThanOrEqual(suggestions[2]?.matchScore ?? 0);
  });
});
