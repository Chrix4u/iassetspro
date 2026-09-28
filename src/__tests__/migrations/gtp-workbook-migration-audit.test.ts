import { describe, expect, it } from 'vitest';
import {
  auditGtpWorkbookRows,
  canonicalizeGtpTrade,
  findDuplicateMachineCodes,
  inferGtpWorkStatus,
  mapGtpPriority,
  mapGtpWorkOrderType,
  mapGtpWorkStatus,
  resolveGtpMachine,
} from '@/services/migrations/gtpWorkbookMigration.service';

describe('GTP workbook historical migration audit', () => {
  it('maps legacy machine priority safely and treats 5 as an unmapped fallback', () => {
    expect(mapGtpPriority(1)).toBe('critical');
    expect(mapGtpPriority(2)).toBe('high');
    expect(mapGtpPriority(3)).toBe('medium');
    expect(mapGtpPriority(5)).toBeNull();
  });

  it('normalizes known historical trade aliases without losing canonical GTP names', () => {
    expect(canonicalizeGtpTrade('Carpentry')).toBe('Carpentery');
    expect(canonicalizeGtpTrade('Carpenter')).toBe('Carpentery');
    expect(canonicalizeGtpTrade('Machinist')).toBe('Machnist');
    expect(canonicalizeGtpTrade('pipe fitter')).toBe('Pipe fitting');
  });

  it('maps the workbook work-order types and statuses', () => {
    expect(mapGtpWorkOrderType('Breakdown')).toBe('breakdown');
    expect(mapGtpWorkOrderType('Corrective')).toBe('corrective');
    expect(mapGtpWorkStatus('Completed')).toBe('closed');
    expect(mapGtpWorkStatus('In-Progress')).toBe('in_progress');
    expect(mapGtpWorkStatus('')).toBeNull();
  });

  it('finds duplicate machine codes before any import is permitted', () => {
    expect(findDuplicateMachineCodes([
      { code: '342/1', name: 'A' },
      { code: '342/1', name: 'B' },
      { code: '393/1', name: 'C' },
    ])).toEqual(['342/1']);
  });


  it('resolves duplicate machine codes when description plus legacy priority identify one master row', () => {
    const machines = [
      { code: '342/1', name: 'Inspection Table 1', priority: 2 },
      { code: '342/1', name: 'Inspection table 1', priority: 3 },
      { code: '342/1', name: 'Inspection table 3', priority: 3 },
    ];
    const resolved = resolveGtpMachine(
      { equipmentCode: '342/1', equipmentDescription: 'Inspection Table 1', priority: 2 },
      machines,
    );
    expect(resolved.resolution).toBe('duplicate_resolved');
    expect(resolved.machine?.priority).toBe(2);
  });

  it('infers blank historical status conservatively from execution timestamps', () => {
    expect(inferGtpWorkStatus(null, null, null)).toEqual({ status: 'requested', source: 'inferred' });
    expect(inferGtpWorkStatus(null, new Date(), null)).toEqual({ status: 'in_progress', source: 'inferred' });
    expect(inferGtpWorkStatus(null, null, new Date())).toEqual({ status: 'closed', source: 'inferred' });
    expect(inferGtpWorkStatus('closed', null, null)).toEqual({ status: 'closed', source: 'explicit' });
  });

  it('blocks unresolved machine codes while retaining incomplete historical records for review', () => {
    const result = auditGtpWorkbookRows([
      {
        rowNumber: 2,
        workOrderNo: 1001,
        workOrderType: 'Breakdown',
        reportedAt: new Date(),
        equipmentCode: 'UNKNOWN',
        trade: 'Machinist',
        workStatus: '',
      },
    ], [
      { code: 'M-1', name: 'Known Machine', priority: 1 },
    ]);

    expect(result.summary.totalRows).toBe(1);
    expect(result.summary.blockedRows).toBe(1);
    expect(result.summary.unmatchedMachineRows).toBe(1);
    expect(result.summary.missingStatusRows).toBe(0);
    expect(result.summary.inferredStatusRows).toBe(1);
    expect(result.summary.missingStartRows).toBe(1);
    expect(result.summary.missingCompletionRows).toBe(1);
    expect(result.rows[0].canonicalTrade).toBe('Machnist');
    expect(result.rows[0].mappedStatus).toBe('requested');
    expect(result.rows[0].statusSource).toBe('inferred');
    expect(result.rows[0].importReady).toBe(false);
  });
});