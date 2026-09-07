import { describe, expect, it } from 'vitest';
import {
  getRequestInventoryUrl,
  getWorkOrderConversionDefaults,
  toLocalDateInput,
  toLocalDateTimeInput,
} from '@/lib/maintenanceRequestPlanning';

describe('maintenance request planning helpers', () => {
  it('formats local date and time without converting through UTC', () => {
    const local = new Date(2026, 8, 7, 17, 22, 45);

    expect(toLocalDateInput(local)).toBe('2026-09-07');
    expect(toLocalDateTimeInput(local)).toBe('2026-09-07T17:22');
  });

  it('defaults schedule to current local date/time and expected end to today', () => {
    const local = new Date(2026, 8, 7, 9, 5);

    expect(getWorkOrderConversionDefaults(local)).toEqual({
      scheduledDate: '2026-09-07T09:05',
      expectedEndDate: '2026-09-07',
    });
  });

  it('scopes inventory lookup to the persisted maintenance-request plant', () => {
    expect(getRequestInventoryUrl('plant / tema')).toBe(
      '/api/inventory?limit=100&plantId=plant%20%2F%20tema',
    );
  });

  it('retains the base inventory URL only when no request plant is available', () => {
    expect(getRequestInventoryUrl()).toBe('/api/inventory?limit=100');
  });
});
