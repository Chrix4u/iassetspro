import { describe, expect, it } from 'vitest';
import { hasPagePermission, isPageModuleAvailable } from '@/lib/page-access';

describe('page access policy', () => {
  it('fails closed for optional module pages before module state is known', () => {
    expect(isPageModuleAvailable('pm-calendar', null)).toBe(false);
    expect(isPageModuleAvailable('inventory-items', null)).toBe(false);
  });

  it('requires the licensed module set for PM and Inventory pages', () => {
    expect(isPageModuleAvailable('pm-calendar', new Set(['core', 'repairs']))).toBe(false);
    expect(isPageModuleAvailable('pm-calendar', new Set(['core', 'pm_schedules']))).toBe(true);
    expect(isPageModuleAvailable('inventory-items', new Set(['core']))).toBe(false);
    expect(isPageModuleAvailable('inventory-items', new Set(['core', 'inventory']))).toBe(true);
  });

  it('keeps core pages available without optional module state', () => {
    expect(isPageModuleAvailable('dashboard', null)).toBe(true);
  });

  it('requires page-specific permission even when another module permission exists', () => {
    const onlyInventory = (slug: string) => slug === 'inventory.view';
    expect(hasPagePermission('inventory-items', onlyInventory, false)).toBe(true);
    expect(hasPagePermission('inventory-transactions', onlyInventory, false)).toBe(false);
    expect(hasPagePermission('repairs-material-requests', onlyInventory, false)).toBe(false);
  });
});
