import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetSessionAsync, mockGetUnavailableOperationalModules } = vi.hoisted(() => ({
  mockGetSessionAsync: vi.fn(),
  mockGetUnavailableOperationalModules: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getSessionAsync: mockGetSessionAsync,
}));

vi.mock('@/lib/module-access.server', () => ({
  getUnavailableOperationalModules: mockGetUnavailableOperationalModules,
}));

import proxy, { requiredModulesForApiPath, resolveEffectivePlantId } from '@/proxy';

function request(path: string, plantHeader?: string): NextRequest {
  const headers = new Headers({ authorization: 'Bearer valid-token' });
  if (plantHeader) headers.set('X-Plant-ID', plantHeader);
  return new NextRequest(`http://localhost${path}`, { headers });
}

function setSession(permissions: string[], roles = ['maintenance_planner']) {
  mockGetSessionAsync.mockResolvedValue({
    userId: 'user-1',
    username: 'user1',
    fullName: 'Multi Plant User',
    roles,
    permissions,
    createdAt: new Date('2026-09-01T00:00:00Z'),
  });
}

describe('reporting proxy security', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setSession(['reports.view']);
    mockGetUnavailableOperationalModules.mockResolvedValue([]);
  });

  describe('module availability gate', () => {
    it('maps primary and composite APIs to their required modules', () => {
      expect(requiredModulesForApiPath('/api/work-orders/wo-1')).toEqual(['work_orders']);
      expect(requiredModulesForApiPath('/api/inventory')).toEqual(['inventory']);
      expect(requiredModulesForApiPath('/api/repairs/material-requests')).toEqual(['repairs', 'inventory']);
      expect(requiredModulesForApiPath('/api/repairs/tool-transfers/transfer-1')).toEqual(['repairs', 'tools']);
      expect(requiredModulesForApiPath('/api/repairs/reports/detailed')).toEqual(['repairs', 'reports']);
      expect(requiredModulesForApiPath('/api/reports/maintenance/export')).toEqual(['reports', 'work_orders', 'maintenance_requests']);
      expect(requiredModulesForApiPath('/api/reports/enterprise')).toEqual(['reports', 'work_orders', 'assets', 'inventory', 'repairs', 'downtime']);
      expect(requiredModulesForApiPath('/api/ai/rca/generate')).toEqual(['rca_analysis', 'assets']);
      expect(requiredModulesForApiPath('/api/ai/spares/forecast')).toEqual(['forecasting', 'inventory']);
      expect(requiredModulesForApiPath('/api/component-registry/component-1/condition')).toEqual(['assets', 'condition_monitoring']);
      expect(requiredModulesForApiPath('/api/users')).toEqual([]);
    });

    it('blocks authenticated requests before the route when a required module is unavailable', async () => {
      mockGetUnavailableOperationalModules.mockResolvedValue(['work_orders']);

      const response = await proxy(request('/api/work-orders/wo-1'));
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.unavailableModules).toEqual(['work_orders']);
      expect(mockGetUnavailableOperationalModules).toHaveBeenCalledWith(['work_orders']);
    });

    it('checks composite resource modules together', async () => {
      mockGetUnavailableOperationalModules.mockResolvedValue(['inventory']);

      const response = await proxy(request('/api/repairs/material-requests'));
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.unavailableModules).toEqual(['inventory']);
      expect(mockGetUnavailableOperationalModules).toHaveBeenCalledWith(['repairs', 'inventory']);
    });

    it('does not expose module state to unauthenticated protected requests', async () => {
      const response = await proxy(new NextRequest('http://localhost/api/work-orders'));

      expect(response.status).toBe(401);
      expect(mockGetUnavailableOperationalModules).not.toHaveBeenCalled();
    });

    it('requires PM to be operational even for the internal cron secret', async () => {
      mockGetUnavailableOperationalModules.mockResolvedValue(['pm_schedules']);
      const headers = new Headers({ 'x-pm-cron-secret': process.env.PM_CRON_SECRET || 'eam-pm-cron-secret-2025' });

      const response = await proxy(new NextRequest('http://localhost/api/pm-schedules/check-due', { headers }));

      expect(response.status).toBe(403);
      expect(mockGetUnavailableOperationalModules).toHaveBeenCalledWith(['pm_schedules']);
    });
  });

  describe('maintenance reporting plant normalization', () => {
    it('uses the explicit X-Plant-ID header ahead of a query fallback', () => {
      expect(resolveEffectivePlantId(
        request('/api/reports/maintenance?plantId=plant-b', 'plant-a'),
      )).toBe('plant-a');
    });

    it('promotes maintenance report plantId query into the validated plant signal', () => {
      expect(resolveEffectivePlantId(
        request('/api/reports/maintenance?plantId=plant-b'),
      )).toBe('plant-b');
    });

    it('also protects the maintenance export endpoint', () => {
      expect(resolveEffectivePlantId(
        request('/api/reports/maintenance/export?format=xlsx&plantId=plant-c'),
      )).toBe('plant-c');
    });

    it('does not promote arbitrary plantId query parameters on unrelated APIs', () => {
      expect(resolveEffectivePlantId(
        request('/api/assets?plantId=plant-z'),
      )).toBeNull();
    });

    it('forwards the promoted report plant as X-Plant-ID to downstream route handling', async () => {
      const response = await proxy(
        request('/api/reports/maintenance?plantId=plant-b'),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('x-middleware-request-x-plant-id')).toBe('plant-b');
      expect(response.headers.get('x-middleware-request-x-user-plant-id')).toBe('plant-b');
    });
  });

  describe('legacy Repairs reporting permissions', () => {
    it('blocks detailed JSON reports when the user has no report-view capability', async () => {
      setSession([]);

      const response = await proxy(request('/api/repairs/reports/detailed?format=json'));
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.error).toContain('reports.view');
    });

    it('allows detailed JSON reports for report viewers', async () => {
      setSession(['reports.view']);

      const response = await proxy(request('/api/repairs/reports/detailed?format=json'));

      expect(response.status).toBe(200);
    });

    it('blocks detailed XLSX exports for view-only users', async () => {
      setSession(['reports.view']);

      const response = await proxy(request('/api/repairs/reports/detailed?format=xlsx'));
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.error).toContain('reports.export');
    });

    it('allows detailed XLSX exports for explicit report exporters', async () => {
      setSession(['reports.export']);

      const response = await proxy(request('/api/repairs/reports/detailed?format=xlsx'));

      expect(response.status).toBe(200);
    });

    it('rejects unsupported detailed-report formats instead of treating them as XLSX', async () => {
      setSession(['reports.export']);

      const response = await proxy(request('/api/repairs/reports/detailed?format=csv'));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toContain('json or xlsx');
    });

    it('blocks legacy aggregate PDF exports for view-only users', async () => {
      setSession(['reports.view']);

      const response = await proxy(request('/api/repairs/reports?type=lifecycle&format=pdf'));
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.error).toContain('reports.export');
    });

    it('allows legacy aggregate PDF exports to reach the route for report exporters', async () => {
      setSession(['reports.export']);

      const response = await proxy(request('/api/repairs/reports?type=lifecycle&format=pdf'));

      expect(response.status).toBe(200);
    });

    it('allows administrators regardless of explicit report permissions', async () => {
      setSession([], ['admin']);

      const response = await proxy(request('/api/repairs/reports/detailed?format=xlsx'));

      expect(response.status).toBe(200);
    });
  });
});
