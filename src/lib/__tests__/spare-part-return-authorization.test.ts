import { describe, expect, it } from 'vitest';
import {
  canCompleteSpareRefurbishment,
  canDisposeSparePartReturn,
  canEditSparePartReturn,
  canInspectSparePartReturn,
  canRejectSparePartReturn,
  canReturnSparePartToStore,
  canStartSpareRefurbishment,
  canViewAllSparePartReturns,
} from '@/lib/spare-part-return-authorization';

const actor = (roles: string[], userId = 'u-1') => ({ roles, userId });

describe('spare part return authorization policy', () => {
  it('keeps inspection/view authority with store and maintenance custody roles', () => {
    for (const role of ['admin', 'store_keeper', 'inventory_manager', 'tools_shop_attendant', 'maintenance_supervisor', 'maintenance_manager', 'plant_manager']) {
      expect(canInspectSparePartReturn(actor([role]))).toBe(true);
      expect(canViewAllSparePartReturns(actor([role]))).toBe(true);
      expect(canRejectSparePartReturn(actor([role]))).toBe(true);
    }
    expect(canInspectSparePartReturn(actor(['technician']))).toBe(false);
  });

  it('restricts refurbishment start to maintenance management roles', () => {
    expect(canStartSpareRefurbishment(actor(['maintenance_supervisor']))).toBe(true);
    expect(canStartSpareRefurbishment(actor(['maintenance_manager']))).toBe(true);
    expect(canStartSpareRefurbishment(actor(['plant_manager']))).toBe(true);
    expect(canStartSpareRefurbishment(actor(['store_keeper']))).toBe(false);
  });

  it('lets the assigned refurbisher complete without broadening start authority', () => {
    expect(canCompleteSpareRefurbishment(actor(['technician'], 'tech-7'), { refurbisherId: 'tech-7' })).toBe(true);
    expect(canCompleteSpareRefurbishment(actor(['technician'], 'tech-8'), { refurbisherId: 'tech-7' })).toBe(false);
    expect(canStartSpareRefurbishment(actor(['technician'], 'tech-7'))).toBe(false);
  });

  it('separates store-return and disposal custody roles', () => {
    expect(canReturnSparePartToStore(actor(['tools_shop_attendant']))).toBe(true);
    expect(canDisposeSparePartReturn(actor(['tools_shop_attendant']))).toBe(false);
    expect(canDisposeSparePartReturn(actor(['store_keeper']))).toBe(true);
    expect(canReturnSparePartToStore(actor(['maintenance_supervisor']))).toBe(false);
  });

  it('allows basic edits to maintenance management or the original requester', () => {
    expect(canEditSparePartReturn(actor(['technician'], 'tech-1'), 'tech-1')).toBe(true);
    expect(canEditSparePartReturn(actor(['technician'], 'tech-2'), 'tech-1')).toBe(false);
    expect(canEditSparePartReturn(actor(['maintenance_supervisor'], 'sup-1'), 'tech-1')).toBe(true);
  });
});
