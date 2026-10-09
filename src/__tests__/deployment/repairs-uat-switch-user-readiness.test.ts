import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const source = fs.readFileSync(path.join(process.cwd(), 'e2e/repairs/helpers/auth.ts'), 'utf8');

describe('Repairs UAT switchUser readiness contract', () => {
  it('waits for stable semantic app shell landmarks instead of a nonexistent sidebar data attribute', () => {
    expect(source).not.toContain("waitForSelector('[data-sidebar]'");
    expect(source).toContain("expect(page.locator('main')).toBeVisible");
    expect(source).toContain("expect(page.getByRole('navigation')).toBeVisible");
  });

  it('does not register a persistent auth init script that can overwrite later user switches', () => {
    expect(source).not.toContain('await context.addInitScript');
    expect(source).toContain('const bootstrapPage = await context.newPage()');
    expect(source).toContain("localStorage.setItem('eam_token', tok)");
  });

  it('verifies the switched token survives reload before continuing', () => {
    expect(source).toContain("await page.evaluate(() => localStorage.getItem('eam_token'))");
    expect(source).toContain('expect(activeToken).toBe(token)');
  });
});
