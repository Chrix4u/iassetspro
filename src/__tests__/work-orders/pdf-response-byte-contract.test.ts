import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8');
const closedPack = read('src/app/api/work-orders/[id]/closed-pack/route.ts');
const reports = read('src/app/api/work-orders/reports/route.ts');

describe('work order PDF response byte contracts', () => {
  it('returns closed-pack PDF bytes through Uint8Array', () => {
    expect(closedPack).toContain('new NextResponse(new Uint8Array(pdfBuffer), {');
    expect(closedPack).not.toContain('new NextResponse(pdfBuffer, {');
  });

  it('returns report PDF bytes through Uint8Array', () => {
    expect(reports).toContain('new NextResponse(new Uint8Array(pdfBuffer), {');
    expect(reports).not.toContain('new NextResponse(pdfBuffer, {');
  });

  it('preserves application/pdf response headers', () => {
    expect(closedPack).toContain("'Content-Type': 'application/pdf'");
    expect(reports).toContain("'Content-Type': 'application/pdf'");
  });
});
