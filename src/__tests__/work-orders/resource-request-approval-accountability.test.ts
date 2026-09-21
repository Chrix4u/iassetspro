import { describe, expect, it } from 'vitest';
import type { SessionData } from '@/lib/auth';
import fs from 'node:fs';
import path from 'node:path';
import {
  RESOURCE_STORE_ROLE_SLUGS,
  canReviewResourceRequestAsSupervisor,
  isResourceStoreActor,
} from '@/lib/resource-request-approval';

const session = (
  userId: string,
  roles: string[],
  permissions: string[] = [],
): SessionData => ({
  userId,
  username: userId,
  fullName: userId,
  roles,
  permissions,
  createdAt: new Date('2026-09-18T00:00:00Z'),
});

const repairsUi = fs.readFileSync(
  path.join(process.cwd(), 'src/components/modules/RepairsPagesLegacy.tsx'),
  'utf8',
);
const workOrderUi = fs.readFileSync(
  path.join(process.cwd(), 'src/components/modules/MaintenancePages.tsx'),
  'utf8',
);

describe('resource request approval accountability', () => {
  it('allows only the assigned maintenance supervisor at the normal supervisor stage', () => {
    const assigned = session(
      'sup-a',
      ['maintenance_supervisor'],
      ['repair_material_requests.update'],
    );
    const unrelated = session(
      'sup-b',
      ['maintenance_supervisor'],
      ['repair_material_requests.update'],
    );

    expect(canReviewResourceRequestAsSupervisor(
      assigned,
      'sup-a',
      'repair_material_requests.update',
    )).toBe(true);
    expect(canReviewResourceRequestAsSupervisor(
      unrelated,
      'sup-a',
      'repair_material_requests.update',
    )).toBe(false);
    expect(canReviewResourceRequestAsSupervisor(
      assigned,
      null,
      'repair_material_requests.update',
    )).toBe(false);
    expect(canReviewResourceRequestAsSupervisor(
      session('sup-a', ['maintenance_supervisor']),
      'sup-a',
      'repair_material_requests.update',
    )).toBe(false);
  });

  it('allows management/admin escalation overrides', () => {
    expect(canReviewResourceRequestAsSupervisor(
      session('mm', ['maintenance_manager'], ['repair_tool_requests.update']),
      'sup-a',
      'repair_tool_requests.update',
    )).toBe(true);
    expect(canReviewResourceRequestAsSupervisor(
      session('pm', ['plant_manager'], ['repair_tool_requests.update']),
      'sup-a',
      'repair_tool_requests.update',
    )).toBe(true);
    expect(canReviewResourceRequestAsSupervisor(
      session('admin', ['admin']),
      'sup-a',
      'repair_tool_requests.update',
    )).toBe(true);
  });

  it('hides supervisor/store approval actions when the effective update grant is absent', () => {
    expect(repairsUi).toContain("canApproveAsSupervisor(r, user, 'repair_material_requests.update')");
    expect(repairsUi).toContain("canApproveAsSupervisor(r, user, 'repair_tool_requests.update')");
    expect(repairsUi).toContain("canApproveAsStore(user, 'repair_material_requests.update')");
    expect(repairsUi).toContain("canApproveAsStore(user, 'repair_tool_requests.update')");
  });

  it('mirrors accountable supervisor/store authorization on WO Details', () => {
    expect(workOrderUi).toContain('const canReviewMaterialRequestAsSupervisorLocal');
    expect(workOrderUi).toContain("hasPermission('repair_material_requests.update')");
    expect(workOrderUi).toContain("slugs.includes('maintenance_manager')");
    expect(workOrderUi).toContain("slugs.includes('plant_manager')");
    expect(workOrderUi).toContain("slugs.includes('maintenance_supervisor')");
    expect(workOrderUi).toContain('wo?.assignedSupervisorId === user.id');
    expect(workOrderUi).toContain('mr.status === \'pending\' && canReviewMaterialRequestAsSupervisorLocal()');
    expect(workOrderUi).toContain('const isStoreOrAdminLocal');
    expect(workOrderUi).toContain("slugs.includes('store_keeper')");
    expect(workOrderUi).toContain("slugs.includes('inventory_manager')");
    expect(workOrderUi).toContain("slugs.includes('tools_shop_attendant')");
  });

  it('keeps store-stage actors aligned with the authorized store roles', () => {
    expect(RESOURCE_STORE_ROLE_SLUGS).toEqual([
      'store_keeper',
      'inventory_manager',
      'tools_shop_attendant',
    ]);

    for (const role of RESOURCE_STORE_ROLE_SLUGS) {
      expect(isResourceStoreActor(
        session(role, [role], ['repair_material_requests.update']),
        'repair_material_requests.update',
      )).toBe(true);
      expect(isResourceStoreActor(
        session(role, [role]),
        'repair_material_requests.update',
      )).toBe(false);
    }
    expect(isResourceStoreActor(
      session('tech', ['maintenance_technician'], ['repair_material_requests.update']),
      'repair_material_requests.update',
    )).toBe(false);
    expect(isResourceStoreActor(
      session('admin', ['admin']),
      'repair_material_requests.update',
    )).toBe(true);
  });
});
