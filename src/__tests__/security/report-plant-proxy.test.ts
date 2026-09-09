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

describe('maintenance reporting plant normalization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetSessionAsync.mockResolvedValue({
      userId: 'user-1',
      fullName: 'Multi Plant User',
      roles: ['maintenance_planner'],
      permissions: ['reports.view'],
    });
  });

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
