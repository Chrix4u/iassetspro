import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = fs.readFileSync('src/components/modules/MaintenancePages.tsx', 'utf8');
const route = fs.readFileSync('src/app/api/pm-schedules/[id]/route.ts', 'utf8');

describe('PM schedule UI permission alignment', () => {
  it('uses PM/work-order schedule authority for deactivation instead of role-administration permission', () => {
    const start = page.indexOf('export function PmSchedulesPage()');
    const end = page.indexOf('export function MaintenanceDashboardPage()', start);
    const schedulePage = page.slice(start, end > start ? end : page.length);

    expect(route).toContain("hasPermission(session, 'pm_schedules.delete')");
    expect(route).toContain("hasPermission(session, 'work_orders.delete')");
    expect(schedulePage).toContain("hasPermission('pm_schedules.delete') || hasPermission('work_orders.delete') || isAdmin()");
    expect(schedulePage).not.toContain("hasPermission('roles.update')");
  });
});
