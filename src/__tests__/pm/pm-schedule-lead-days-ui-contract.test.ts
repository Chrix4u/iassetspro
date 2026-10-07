import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const maintenancePages = fs.readFileSync('src/components/modules/MaintenancePages.tsx', 'utf8');

describe('PM schedule lead-days form contract', () => {
  it('preserves an explicit zero lead-days value when loading a schedule for edit', () => {
    expect(maintenancePages).not.toContain("setFormLeadDays(String(item.leadDays || 3))");
    expect(maintenancePages).toContain("setFormLeadDays(String(item.leadDays ?? 3))");
  });

  it('does not coerce an explicit zero back to the three-day default on save', () => {
    expect(maintenancePages).not.toContain("parseInt(formLeadDays, 10) || 3");
    expect(maintenancePages).toContain("formLeadDays.trim() === '' ? 3 : parseInt(formLeadDays, 10)");
  });
});
