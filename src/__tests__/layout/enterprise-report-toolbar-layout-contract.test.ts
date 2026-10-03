import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('enterprise report toolbar layout contract', () => {
  it('keeps date filtering and report actions on one responsive operating toolbar', () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/components/modules/EnterpriseReports.tsx'),
      'utf8',
    );

    expect(source).toContain('lg:flex-row lg:items-end lg:justify-between');
    expect(source).toContain('lg:flex-nowrap lg:justify-end');
    expect(source).toContain('DateRangePicker label="Date Range"');
    expect(source).toContain('Generate');
    expect(source).toContain('Refresh');
    expect(source).toContain('PDF');
    expect(source).toContain('CSV');
  });
});
