import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { mockGetSessionAsync } = vi.hoisted(() => ({
  mockGetSessionAsync: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getSessionAsync: mockGetSessionAsync,
}));

import proxy, { resolveEffectivePlantId } from '@/proxy';

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
