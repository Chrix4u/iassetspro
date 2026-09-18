import { describe, expect, it } from 'vitest';
import type { SessionData } from '@/lib/auth';
import {
  RESOURCE_STORE_ROLE_SLUGS,
  canReviewResourceRequestAsSupervisor,
  isResourceStoreActor,
} from '@/lib/resource-request-approval';

const session = (userId: string, roles: string[]): SessionData => ({
  userId,
  username: userId,
  fullName: userId,
  roles,
  permissions: [],
  createdAt: new Date('2026-09-18T00:00:00Z'),
});

describe('resource request approval accountability', () => {
  it('allows only the assigned maintenance supervisor at the normal supervisor stage', () => {
    const assigned = session('sup-a', ['maintenance_supervisor']);
    const unrelated = session('sup-b', ['maintenance_supervisor']);

    expect(canReviewResourceRequestAsSupervisor(assigned, 'sup-a')).toBe(true);
    expect(canReviewResourceRequestAsSupervisor(unrelated, 'sup-a')).toBe(false);
    expect(canReviewResourceRequestAsSupervisor(assigned, null)).toBe(false);
  });

  it('allows management/admin escalation overrides', () => {
    expect(canReviewResourceRequestAsSupervisor(session('mm', ['maintenance_manager']), 'sup-a')).toBe(true);
    expect(canReviewResourceRequestAsSupervisor(session('pm', ['plant_manager']), 'sup-a')).toBe(true);
    expect(canReviewResourceRequestAsSupervisor(session('admin', ['admin']), 'sup-a')).toBe(true);
  });

  it('keeps store-stage actors aligned with the authorized store roles', () => {
    expect(RESOURCE_STORE_ROLE_SLUGS).toEqual([
      'store_keeper',
      'inventory_manager',
      'tools_shop_attendant',
    ]);

    for (const role of RESOURCE_STORE_ROLE_SLUGS) {
      expect(isResourceStoreActor(session(role, [role]))).toBe(true);
    }
    expect(isResourceStoreActor(session('tech', ['maintenance_technician']))).toBe(false);
    expect(isResourceStoreActor(session('admin', ['admin']))).toBe(true);
  });
});
