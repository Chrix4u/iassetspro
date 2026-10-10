import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const page = fs.readFileSync('src/components/modules/MaintenancePages.tsx', 'utf8');
const listRoute = fs.readFileSync('src/app/api/pm-schedules/route.ts', 'utf8');
const detailRoute = fs.readFileSync('src/app/api/pm-schedules/[id]/route.ts', 'utf8');

describe('PM schedule UI/API permission alignment', () => {
  const workOrdersStart = page.indexOf('export function WorkOrdersPage()');
  const workOrdersEnd = page.indexOf('export function CreateWOForm(', workOrdersStart);
  const workOrdersPage = page.slice(workOrdersStart, workOrdersEnd > workOrdersStart ? workOrdersEnd : page.length);
  const start = page.indexOf('export function PmSchedulesPage()');
  const end = page.indexOf('export function MaintenanceDashboardPage()', start);
  const schedulePage = page.slice(start, end > start ? end : page.length);

  it('accepts dedicated PM permissions while preserving legacy work-order compatibility', () => {
    expect(listRoute).toContain("hasPermission(session, 'pm_schedules.create')");
    expect(listRoute).toContain("hasPermission(session, 'work_orders.create')");
    expect(detailRoute).toContain("hasPermission(session, 'pm_schedules.update')");
    expect(detailRoute).toContain("hasPermission(session, 'work_orders.update')");
    expect(detailRoute).toContain("hasPermission(session, 'pm_schedules.activate')");
    expect(detailRoute).toContain('const isActivationOnly = requestedFields.length === 1');
    expect(detailRoute).toContain("requestedFields[0] === 'isActive'");
    expect(detailRoute).toContain('body.isActive === true');
    expect(detailRoute).toContain('const canActivateSchedule = isActivationOnly');
    expect(detailRoute).toContain("hasPermission(session, 'pm_schedules.delete')");
    expect(detailRoute).toContain("hasPermission(session, 'work_orders.delete')");
  });

  it('shows Create/Edit/Deactivate/Activate using schedule authority rather than role administration', () => {
    expect(schedulePage).toContain("const canCreateSchedule = hasPermission('pm_schedules.create') || hasPermission('work_orders.create') || isAdmin()");
    expect(schedulePage).toContain("const canUpdateSchedule = hasPermission('pm_schedules.update') || hasPermission('work_orders.update') || isAdmin()");
    expect(schedulePage).toContain("const canDeactivateSchedule = hasPermission('pm_schedules.delete') || hasPermission('work_orders.delete') || isAdmin()");
    expect(schedulePage).toContain("const canActivateSchedule = hasPermission('pm_schedules.activate') || canUpdateSchedule");
    expect(schedulePage).toContain("{canCreateSchedule && (");
    expect(schedulePage).toContain("handleSetScheduleActive(s.id, !s.isActive)");
    expect(schedulePage).toContain("s.isActive ? 'Deactivate' : 'Activate'");
    expect(schedulePage).not.toContain("hasPermission('roles.update')");
  });
  it('does not leak PM schedule authority into work-order creation', () => {
    expect(workOrdersPage).toContain("hasPermission('work_orders.create')");
    expect(workOrdersPage).not.toContain('canCreateSchedule');
  });

});
