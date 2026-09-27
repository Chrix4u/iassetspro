import { describe, expect, it } from 'vitest';
import type { SessionData } from '@/lib/auth';
import {
  canCreateComponentHierarchy,
  canDeleteComponentHierarchy,
  canUpdateComponentHierarchy,
  canViewComponentHierarchy,
} from '@/lib/component-registry-permissions';

function session(permissions: string[], roles: string[] = ['maintenance_planner']): SessionData {
  return {
    userId: 'user-1',
    username: 'planner',
    fullName: 'Planner',
    roles,
    permissions,
    createdAt: new Date(),
  };
}

describe('component hierarchy permissions', () => {
  it('allows maintenance planners to manage hierarchy without digital-twin administration', () => {
    const planner = session(['assets.view', 'assets.hierarchy', 'assets.create', 'assets.update', 'assemblies.create']);
    expect(canViewComponentHierarchy(planner)).toBe(true);
    expect(canCreateComponentHierarchy(planner)).toBe(true);
    expect(canUpdateComponentHierarchy(planner)).toBe(true);
    expect(canDeleteComponentHierarchy(planner)).toBe(false);
  });

  it('keeps destructive hierarchy deletion restricted', () => {
    const manager = session(['assets.hierarchy', 'assets.delete'], ['maintenance_manager']);
    expect(canDeleteComponentHierarchy(manager)).toBe(true);

    const viewer = session(['assets.view']);
    expect(canViewComponentHierarchy(viewer)).toBe(true);
    expect(canCreateComponentHierarchy(viewer)).toBe(false);
    expect(canUpdateComponentHierarchy(viewer)).toBe(false);
    expect(canDeleteComponentHierarchy(viewer)).toBe(false);
  });

  it('preserves digital-twin manage access', () => {
    const twinManager = session(['digital_twin.manage']);
    expect(canCreateComponentHierarchy(twinManager)).toBe(true);
    expect(canUpdateComponentHierarchy(twinManager)).toBe(true);
    expect(canDeleteComponentHierarchy(twinManager)).toBe(true);
  });
});