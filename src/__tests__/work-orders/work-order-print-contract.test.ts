import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const route = readFileSync(join(process.cwd(), 'src/app/api/work-orders/[id]/print/route.ts'), 'utf8');

describe('work order print route contracts', () => {
  it('keeps asset enrichment immutable and separates category', () => {
    expect(route).toContain('const assetRecord = wo.assetId');
    expect(route).toContain('const assetCategory = assetRecord?.category ?? null;');
    expect(route).toContain('const { category: _category, ...assetWithoutCategory } = assetRecord;');
    expect(route).not.toContain('let asset = null;');
  });

  it('normalizes nullable company fields for the PDF contract', () => {
    expect(route).toContain("phone: companyProfile.phone ?? ''");
    expect(route).toContain("email: companyProfile.email ?? ''");
    expect(route).toContain("website: companyProfile.website ?? ''");
    expect(route).toContain("currency: companyProfile.currency || 'GHS'");
  });

  it('returns PDF bytes through a Web-compatible Uint8Array body', () => {
    expect(route).toContain('new NextResponse(new Uint8Array(pdfBuffer), {');
  });
});
