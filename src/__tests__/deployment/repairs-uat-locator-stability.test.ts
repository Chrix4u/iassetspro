import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

describe('Repairs UAT locator stability', () => {
  it('scopes PM closeout work-order selection to main instead of the global plant combobox', () => {
    const source = read('e2e/repairs/scenario-s-pm-template-execution.spec.ts');
    expect(source).not.toContain("page.getByRole('combobox').first().click()");
    expect(source).toContain("page.getByRole('main').getByRole('combobox').click()");
  });

  it('scopes the Purchase Orders heading to main to avoid duplicate sidebar/page headings', () => {
    const source = read('e2e/repairs/scenario-p-inventory-procurement-reuse.spec.ts');
    expect(source).toContain("inventoryPage.getByRole('main').getByRole('heading', { name: 'Purchase Orders', exact: true })");
  });

  it('asserts the selected PM work order through the completion combobox instead of duplicate page text', () => {
    const source = read('e2e/repairs/scenario-s-pm-template-execution.spec.ts');
    expect(source).not.toContain("await expect(page.getByText(`${completed.woNumber} — ${completed.title}`, { exact: true })).toBeVisible");
    expect(source).toContain("page.getByRole('combobox', { name: 'Search work orders' })");
    expect(source).toContain("toContainText(completed.woNumber");
  });

});
