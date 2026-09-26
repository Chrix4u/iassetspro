import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const read = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8');

describe('global operational-module enforcement', () => {
  const pageAccess = read('src/lib/page-access.ts');
  const moduleAccess = read('src/lib/module-access.ts');
  const moduleAccessServer = read('src/lib/module-access.server.ts');
  const app = read('src/components/EAMApp.tsx');
  const sidebar = read('src/components/shared/Sidebar.tsx');
  const mobile = read('src/components/shared/MobileBottomNav.tsx');
  const palette = read('src/components/CommandPalette.tsx');
  const dashboard = read('src/components/modules/DashboardPages.tsx');
  const dashboardApi = read('src/app/api/dashboard/stats/route.ts');
  const searchApi = read('src/app/api/search/route.ts');
  const searchSuggestApi = read('src/app/api/search/suggest/route.ts');
  const searchAccess = read('src/lib/search-access.ts');
  const enterpriseSearch = read('src/services/enterpriseSearch.service.ts');
  const proxy = read('src/proxy.ts');
  const modulesApi = read('src/app/api/modules/route.ts');
  const moduleUpdateApi = read('src/app/api/modules/[id]/route.ts');
  const seed = read('prisma/seed.ts');
  const referenceSeed = read('prisma/seed-reference-data.ts');

  it('reserves non-disableable core for the platform control plane only', () => {
    expect(moduleAccess).toContain(
      "CONTROL_PLANE_CORE_MODULE_CODES = new Set(['core', 'modules'])",
    );
    expect(pageAccess).toContain("CORE_MODULE_CODES = new Set(['core'])");
    expect(moduleUpdateApi).toContain(
      'isControlPlaneCoreModule(systemModule.code)',
    );

    for (const code of ['assets', 'maintenance_requests', 'work_orders', 'inventory']) {
      const line = seed
        .split('\n')
        .find((candidate) => candidate.includes(`code: '${code}'`));
      expect(line).toBeDefined();
      expect(line).toContain('isCore: false');
    }

    for (const code of ['assets', 'maintenance_requests', 'work_orders', 'inventory']) {
      const line = referenceSeed
        .split('\n')
        .find((candidate) => candidate.includes(`code: '${code}'`));
      expect(line).toBeDefined();
      expect(line).toContain('isCore: false');
    }
  });

  it('requires system license, company license, enabled, and active state', () => {
    expect(moduleAccess).toContain('systemModule.isSystemLicensed === true');
    expect(moduleAccess).toContain('Boolean(companyModule?.licensedAt)');
    expect(moduleAccess).toContain('companyModule?.isEnabled === true');
    expect(moduleAccess).toContain('companyModule?.isActive === true');
    expect(modulesApi).toContain('isSystemModuleLicensed(m, now)');
    expect(moduleAccessServer).toContain(
      'getUnavailableOperationalModules',
    );
  });

  it('fails closed while operational module state is unresolved', () => {
    expect(pageAccess).toContain('pageModuleStateResolved');
    expect(pageAccess).toContain('enabledModules === null');
    expect(app).toContain(
      'const moduleResolved = pageModuleStateResolved(page, enabledModules)',
    );
    expect(app).toContain(
      'if (!moduleResolved || !pageAllowed) return <LoadingSkeleton />',
    );
  });

  it('enforces modules across desktop, mobile, command palette, and app shell', () => {
    expect(sidebar).toContain('CORE_MODULE_CODES.has(normalized)');
    expect(mobile).toContain('pageModuleIsEnabled(page, enabledModules)');
    expect(palette).toContain(
      'pageModuleIsEnabled(page, enabledModules)',
    );
    expect(palette).toContain('buildNavigationItems().filter');
    expect(app).toContain(
      "pageModuleIsEnabled('notifications', enabledModules)",
    );
  });

  it('requires every dependency behind composite pages', () => {
    expect(pageAccess).toContain(
      "'reports-inventory': ['reports', 'inventory']",
    );
    expect(pageAccess).toContain(
      "'reports-production': ['reports', 'production']",
    );
    expect(pageAccess).toContain(
      "'reports-quality': ['reports', 'quality']",
    );
    expect(pageAccess).toContain(
      "'reports-safety': ['reports', 'safety']",
    );
    expect(pageAccess).toContain(
      "'reports-asset': ['reports', 'assets']",
    );
    expect(pageAccess).toContain(
      "'reports-maintenance': ['reports', 'work_orders', 'maintenance_requests']",
    );
    expect(pageAccess).toContain(
      "'maintenance-analytics': ['work_orders', 'analytics']",
    );
    expect(pageAccess).toContain(
      "'repairs-analytics': ['repairs', 'analytics']",
    );
  });

  it('removes disabled module dashboard data and presentation surfaces', () => {
    expect(dashboardApi).toContain('buildOperationalModuleSet(moduleRows)');
    for (const code of [
      'assets',
      'maintenance_requests',
      'work_orders',
      'inventory',
      'notifications',
      'pm_schedules',
      'production',
      'quality',
      'safety',
      'iot_sensors',
      'analytics',
      'reports',
    ]) {
      expect(dashboardApi).toContain(`'${code}'`);
    }

    expect(dashboardApi).toContain(
      "const canViewWorkOrderKPIs = moduleOperational('work_orders')",
    );
    expect(dashboardApi).toContain(
      "const canViewRequestKPIs = moduleOperational('maintenance_requests')",
    );
    expect(dashboardApi).toContain(
      "const canViewAssetKPIs = moduleOperational('assets')",
    );
    expect(dashboardApi).toContain(
      "const canViewInventoryKPIs = moduleOperational('inventory')",
    );
    expect(dashboard).toContain('workOrdersEnabled');
    expect(dashboard).toContain('requestsEnabled');
    expect(dashboard).toContain('assetsEnabled');
    expect(dashboard).toContain('notificationsEnabled');
  });

  it('blocks disabled module APIs before route execution', () => {
    expect(proxy).toContain(
      "{ prefix: '/api/work-orders', modules: ['work_orders'] }",
    );
    expect(proxy).toContain(
      "{ prefix: '/api/maintenance-requests', modules: ['maintenance_requests'] }",
    );
    expect(proxy).toContain(
      "{ prefix: '/api/inventory', modules: ['inventory'] }",
    );
    expect(proxy).toContain(
      "{ prefix: '/api/repairs/material-requests', modules: ['repairs', 'inventory'] }",
    );
    expect(proxy).toContain(
      "{ prefix: '/api/repairs/tool-requests', modules: ['repairs', 'tools'] }",
    );
    expect(proxy).toContain(
      'Required module is not licensed, enabled, and active',
    );
  });

  it('enforces module, plant, and own-record scope in global search', () => {
    expect(searchApi).toContain('buildSearchAccessContext(request, session)');
    expect(searchSuggestApi).toContain(
      'buildSearchAccessContext(request, session)',
    );
    expect(searchAccess).toContain('buildOperationalModuleSet(moduleRows)');
    expect(searchAccess).toContain(
      "operationalModules.has('work_orders')",
    );
    expect(searchAccess).toContain(
      "operationalModules.has('maintenance_requests')",
    );
    expect(enterpriseSearch).toContain(
      "where.plantId = plantIds.length > 0 ? { in: plantIds } : '__ACCESS_DENIED__'",
    );
    expect(enterpriseSearch).toContain(
      '{ teamMembers: { some: { userId } } }',
    );
  });
});
