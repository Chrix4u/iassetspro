import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = fs.readFileSync('src/components/repairs/reporting/RWOPReportingPage.tsx', 'utf8');

function detailTableMarkup(): string {
  const start = page.indexOf('data-testid="maintenance-work-order-detail-table"');
  const end = page.indexOf('</table>', start);
  return page.slice(start, end);
}

describe('maintenance report work-order table alignment', () => {
  it('uses one scroll owner and one fixed-layout table for header/body alignment', () => {
    expect(page).toContain('max-h-[620px] w-full overflow-auto');
    expect(page).toContain('data-testid="maintenance-work-order-detail-table"');
    expect(page).toContain('min-w-[1480px] table-fixed');
  });

  it('defines an explicit width for all eleven work-order columns', () => {
    const markup = detailTableMarkup();
    expect((markup.match(/<col style=/g) || []).length).toBe(11);
    expect(markup).toContain('<TableCell colSpan={11}>');
  });

  it('keeps the same eleven columns visible instead of breakpoint-hiding headers or cells', () => {
    const markup = detailTableMarkup();
    expect(markup).not.toContain('hidden lg:table-cell');
    expect(markup).not.toContain('hidden xl:table-cell');
    expect(markup).toContain('<TableHead>Assigned To</TableHead>');
    expect(markup).toContain('<TableHead>Created</TableHead>');
  });

  it('sticks header cells inside the same scroll container as the body', () => {
    const markup = detailTableMarkup();
    expect(markup).toContain('[&_th]:sticky');
    expect(markup).toContain('[&_th]:top-0');
  });
});
