'use client';

import { useNavigationStore } from '@/stores/navigationStore';
import { useEffect } from 'react';

/**
 * Hook to check if a module is enabled/active.
 * Returns true if:
 * - Core is always available while module state is loading
 * - The module code is in the enabled set
 * - The module is core (always visible)
 *
 * @param moduleCode - The module code to check (case-insensitive), e.g. 'work_orders', 'safety', 'production'
 * @returns boolean - true if the module should be visible
 */
export function useModuleEnabled(moduleCode: string): boolean {
  const { enabledModules, fetchModules } = useNavigationStore();

  useEffect(() => {
    fetchModules();
  }, [fetchModules]);

  const code = moduleCode.toLowerCase();
  if (code === 'core') return true;
  // Fail closed until the authoritative module/license state is loaded.
  if (enabledModules === null) return false;
  return enabledModules.has(code);
}

/**
 * Hook to get the full set of enabled module codes.
 * Returns null if not loaded yet.
 */
export function useEnabledModules(): Set<string> | null {
  const { enabledModules, fetchModules } = useNavigationStore();

  useEffect(() => {
    fetchModules();
  }, [fetchModules]);

  return enabledModules;
}

/** Module code constants for type safety */
export const MODULE_CODES = {
  CORE: 'core',
  ASSETS: 'assets',
  MAINTENANCE_REQUESTS: 'maintenance_requests',
  WORK_ORDERS: 'work_orders',
  REPAIRS: 'repairs',
  INVENTORY: 'inventory',
  PM_SCHEDULES: 'pm_schedules',
  ANALYTICS: 'analytics',
  PRODUCTION: 'production',
  QUALITY: 'quality',
  SAFETY: 'safety',
  IOT_SENSORS: 'iot_sensors',
  CALIBRATION: 'calibration',
  DOWNTIME: 'downtime',
  METER_READINGS: 'meter_readings',
  TRAINING: 'training',
  RISK_ASSESSMENT: 'risk_assessment',
  REPORTS: 'reports',
  TOOLS: 'tools',
  BOM: 'bom',
} as const;

export type ModuleCode = (typeof MODULE_CODES)[keyof typeof MODULE_CODES];