import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const verifier = fs.readFileSync('scripts/verify-gtp-post-import-parity.ts', 'utf8');

describe('GTP post-import parity verifier', () => {
  it('compares canonical GTP namespaces against workbook source counts', () => {
    expect(verifier).toContain("woNumber: { startsWith: 'GTP-WO-' }");
    expect(verifier).toContain("requestNumber: { startsWith: 'GTP-MR-' }");
    expect(verifier).toContain("text(row['Work Order Type']).toLowerCase() === 'breakdown'");
  });

  it('checks the Priority-1 2025 response baseline from database timestamps', () => {
    expect(verifier).toContain("text(row['Prod year reported']) === '2025'");
    expect(verifier).toContain("Number(row['Priority']) === 1");
    expect(verifier).toContain("row.priority === 'critical'");
    expect(verifier).toContain("row.actualStart.getTime() - row.createdAt.getTime()");
  });

  it('requires bidirectional links and migration provenance for every imported row', () => {
    expect(verifier).toContain('workOrderToRequestLinks');
    expect(verifier).toContain('requestToWorkOrderLinks');
    expect(verifier).toContain('"source":"GTP historical workbook"');
    expect(verifier).toContain("schema: 'gtp-post-import-parity/v1'");
  });
});
