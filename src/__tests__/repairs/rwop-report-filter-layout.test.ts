import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = fs.readFileSync('src/components/repairs/reporting/RWOPReportingPage.tsx', 'utf8');

describe('RWOP report filter layout', () => {
  it('reserves two wide-grid columns for the date range so Plant does not overlap it', () => {
    expect(page).toContain('2xl:grid-cols-9');
    expect(page).toContain('md:col-span-2 2xl:col-span-2');
    expect(page).toContain('min-w-0 space-y-1.5');
  });
});
