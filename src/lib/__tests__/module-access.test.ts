import { describe, expect, it } from 'vitest';
import {
  buildOperationalModuleSet,
  isControlPlaneCoreModule,
  isSystemModuleLicensed,
  isSystemModuleOperational,
  pickEffectiveCompanyModule,
  type SystemModuleState,
} from '@/lib/module-access';

function moduleState(overrides: Partial<SystemModuleState> = {}): SystemModuleState {
  return {
    code: 'assets',
    isCore: false,
    isSystemLicensed: true,
    validFrom: null,
    validUntil: null,
    companyModules: [{
      companyId: '__default__',
      isActive: true,
      isEnabled: true,
      licensedAt: new Date('2026-01-01T00:00:00Z'),
    }],
    ...overrides,
  };
}

describe('module access contract', () => {
  it('protects only the true control-plane modules', () => {
    expect(isControlPlaneCoreModule('core')).toBe(true);
    expect(isControlPlaneCoreModule('modules')).toBe(true);
    expect(isControlPlaneCoreModule('assets')).toBe(false);
    expect(isControlPlaneCoreModule('work_orders')).toBe(false);
    expect(isControlPlaneCoreModule('maintenance_requests')).toBe(false);
    expect(isControlPlaneCoreModule('inventory')).toBe(false);
  });

  it('requires vendor license, company license, enabled, and active for operational modules', () => {
    const valid = moduleState();
    expect(isSystemModuleLicensed(valid)).toBe(true);
    expect(isSystemModuleOperational(valid)).toBe(true);

    expect(isSystemModuleOperational(moduleState({ isSystemLicensed: false }))).toBe(false);
    expect(isSystemModuleOperational(moduleState({
      companyModules: [{
        companyId: '__default__',
        isActive: true,
        isEnabled: true,
        licensedAt: null,
      }],
    }))).toBe(false);
    expect(isSystemModuleOperational(moduleState({
      companyModules: [{
        companyId: '__default__',
        isActive: false,
        isEnabled: true,
        licensedAt: new Date('2026-01-01T00:00:00Z'),
      }],
    }))).toBe(false);
    expect(isSystemModuleOperational(moduleState({
      companyModules: [{
        companyId: '__default__',
        isActive: true,
        isEnabled: false,
        licensedAt: new Date('2026-01-01T00:00:00Z'),
      }],
    }))).toBe(false);
  });

  it('does not allow a legacy isCore flag to bypass licensing for an operational module', () => {
    const legacyAssets = moduleState({
      code: 'assets',
      isCore: true,
      isSystemLicensed: false,
      companyModules: [],
    });

    expect(isSystemModuleLicensed(legacyAssets)).toBe(false);
    expect(isSystemModuleOperational(legacyAssets)).toBe(false);
  });

  it('honors license validity dates', () => {
    const now = new Date('2026-09-20T18:00:00Z');

    expect(isSystemModuleOperational(moduleState({
      validFrom: new Date('2026-09-21T00:00:00Z'),
    }), now)).toBe(false);

    expect(isSystemModuleOperational(moduleState({
      validUntil: new Date('2026-09-19T23:59:59Z'),
    }), now)).toBe(false);
  });

  it('prefers the deterministic default company row over legacy null rows', () => {
    const chosen = pickEffectiveCompanyModule([
      {
        companyId: null,
        isActive: true,
        isEnabled: true,
        licensedAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        companyId: '__default__',
        isActive: false,
        isEnabled: false,
        licensedAt: null,
      },
    ]);

    expect(chosen?.companyId).toBe('__default__');
    expect(chosen?.isEnabled).toBe(false);
  });

  it('builds an operational set containing only usable modules', () => {
    const set = buildOperationalModuleSet([
      moduleState({ code: 'assets' }),
      moduleState({
        code: 'inventory',
        companyModules: [{
          companyId: '__default__',
          isActive: true,
          isEnabled: false,
          licensedAt: new Date('2026-01-01T00:00:00Z'),
        }],
      }),
      moduleState({
        code: 'core',
        isCore: true,
        isSystemLicensed: false,
        companyModules: [],
      }),
    ]);

    expect(set.has('assets')).toBe(true);
    expect(set.has('inventory')).toBe(false);
    expect(set.has('core')).toBe(true);
  });
});
