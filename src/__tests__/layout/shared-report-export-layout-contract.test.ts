import { describe, expect, it } from 'vitest';
import fs from 'node:fs';

const helper = fs.readFileSync('src/lib/export-pdf.ts', 'utf8');

describe('shared browser PDF export layout contract', () => {
  it('uses A4 with content-aware portrait/landscape selection', () => {
    expect(helper).toContain("headers.length > 6 ? 'landscape' : 'portrait'");
    expect(helper).toContain('@page { size: A4 ${orientation}; margin: 12mm; }');
  });

  it('renders summary metrics as a professional four-column grid', () => {
    expect(helper).toContain('grid-template-columns: repeat(4, minmax(0, 1fr))');
    expect(helper).toContain('summary-card');
  });

  it('repeats table headers and avoids splitting rows across printed pages', () => {
    expect(helper).toContain('thead { display: table-header-group; }');
    expect(helper).toContain('break-inside: avoid');
    expect(helper).toContain('page-break-inside: avoid');
  });

  it('aligns numeric columns and escapes exported text', () => {
    expect(helper).toContain('inferNumericColumns');
    expect(helper).toContain('font-variant-numeric: tabular-nums');
    expect(helper).toContain('escapeHtml');
  });
});
