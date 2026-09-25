import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const page = fs.readFileSync(
  path.join(process.cwd(), 'src/components/modules/TimesheetPage.tsx'),
  'utf8',
);

describe('Timesheet day-name runtime contract', () => {
  it('uses the defined DAY_NAMES constant for weekly headings and activity rows', () => {
    expect(page).toContain("const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];");
    expect(page).not.toContain('WEEK_NAMES');
    expect((page.match(/DAY_NAMES\[i\]/g) || []).length).toBeGreaterThanOrEqual(2);
  });
});
