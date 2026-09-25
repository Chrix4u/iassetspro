import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const page = fs.readFileSync(
  path.join(process.cwd(), 'src/components/repairs/reporting/RWOPReportingPage.tsx'),
  'utf8',
);

describe('RWOP reporting drill-down contract', () => {
  it('links management exceptions directly to the affected work order', () => {
    expect(page).toContain('href={\`/work-orders/\${item.id}\`}');
    expect(page).toContain('aria-label={\`Open work order \${item.woNumber || item.id}\`}');
  });

  it('links work-order detail rows directly to the work-order page', () => {
    expect(page).toContain('href={\`/work-orders/\${wo.id}\`}');
    expect(page).toContain('aria-label={\`Open work order \${wo.woNumber || wo.id}\`}');
  });

  it('keeps drill-down actions out of printed reports', () => {
    expect(page).toContain('text-right print:hidden');
    expect(page).toContain('<ExternalLink className="ml-1.5 h-3.5 w-3.5" />');
  });
});
