import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PAGE_ACCESS } from '@/lib/page-access';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('RBAC and module navigation contract', () => {
  it('has an explicit access rule for every registered page loader', () => {
    const app = read('src/components/EAMApp.tsx');
    const loaderBlock = app.slice(app.indexOf('const pageLoaders'), app.indexOf('/**\n * PageSwitcher'));
    const loaderPages = [...loaderBlock.matchAll(/^\s*['"]?([a-z0-9-]+)['"]?\s*:\s*\(\)\s*=>/gm)].map(match => match[1]);
    expect(loaderPages.length).toBeGreaterThan(100);
    expect(loaderPages.filter(page => !PAGE_ACCESS[page])).toEqual([]);
  });

  it('fails closed for module licensing/activation and uses company activation state', () => {
    const nav = read('src/stores/navigationStore.ts');
    const hook = read('src/hooks/useModuleEnabled.ts');

    expect(nav).toContain("new Set<string>(['core'])");
    expect(nav).toContain('m.isCore || (m.isSystemLicensed && m.isActive && m.isEnabled)');
    expect(nav).not.toContain('keep null so all');
    expect(hook).toContain('if (enabledModules === null) return false');
    expect(hook).not.toContain('if (enabledModules === null) return true');
  });

  it('separates Repairs Maintenance from PM Maintenance in navigation', () => {
    const sidebar = read('src/components/shared/Sidebar.tsx');
    expect(sidebar).toContain("label: 'Repairs Maintenance'");
    expect(sidebar).toContain("label: 'PM Maintenance'");
    expect(sidebar).not.toContain("label: 'Maintenance', icon: Wrench");
    expect(sidebar).toContain("page: 'pm-calendar'");
    expect(PAGE_ACCESS['pm-calendar'].modules).toEqual(['pm_schedules']);
    expect(PAGE_ACCESS['pm-schedules'].modules).toEqual(['pm_schedules']);
  });

  it('uses one page policy across desktop, direct routes, mobile and command search', () => {
    expect(read('src/components/shared/Sidebar.tsx')).toContain('canAccessPage(child.page');
    expect(read('src/components/EAMApp.tsx')).toContain('canAccessPage(page');
    expect(read('src/components/shared/MobileBottomNav.tsx')).toContain('canAccessPage(item.page');
    expect(read('src/components/CommandPalette.tsx')).toContain('canAccessPage(item.page');
  });

  it('does not fail open dashboard widgets when module state is missing', () => {
    const dashboard = read('src/components/modules/DashboardPages.tsx');
    expect(dashboard).not.toContain('enabledModules.size === 0 ||');
    expect(dashboard).toContain('enabledModules?.has(MODULE_CODES.PM_SCHEDULES) ?? false');
    expect(dashboard).toContain("canAccessPage(mod.page, accessContext)");
  });

  it('keeps PM-only content out of the Repairs dashboard', () => {
    const maintenance = read('src/components/modules/MaintenancePages.tsx');
    const start = maintenance.indexOf('export function MaintenanceDashboardPage');
    const end = maintenance.indexOf('export function MaintenanceAnalyticsPage');
    const repairDashboard = maintenance.slice(start, end);
    expect(repairDashboard).toContain('Repairs Maintenance Dashboard');
    expect(repairDashboard).not.toContain('View PM Calendar');
    expect(repairDashboard).not.toContain('PM Compliance');
  });
});
