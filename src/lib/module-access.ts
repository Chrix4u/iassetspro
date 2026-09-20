export interface CompanyModuleState {
  companyId: string | null;
  isActive: boolean;
  isEnabled: boolean;
  licensedAt: Date | null;
}

export interface SystemModuleState {
  code: string;
  isCore: boolean;
  isSystemLicensed: boolean;
  validFrom: Date | null;
  validUntil: Date | null;
  companyModules: CompanyModuleState[];
}

export function pickEffectiveCompanyModule<T extends CompanyModuleState>(
  companyModules: T[],
): T | null {
  if (!companyModules || companyModules.length === 0) return null;
  return (
    companyModules.find((cm) => cm.companyId === '__default__')
    ?? companyModules.find((cm) => cm.companyId === null)
    ?? companyModules[0]
  );
}

export function isSystemModuleLicensed(
  systemModule: SystemModuleState,
  now = new Date(),
): boolean {
  if (systemModule.isCore) return true;

  const systemLicenseValid = systemModule.isSystemLicensed === true
    && (!systemModule.validFrom || systemModule.validFrom <= now)
    && (!systemModule.validUntil || systemModule.validUntil >= now);

  const companyModule = pickEffectiveCompanyModule(systemModule.companyModules);
  return systemLicenseValid && Boolean(companyModule?.licensedAt);
}

export function isSystemModuleOperational(
  systemModule: SystemModuleState,
  now = new Date(),
): boolean {
  if (systemModule.isCore) return true;

  const companyModule = pickEffectiveCompanyModule(systemModule.companyModules);
  return isSystemModuleLicensed(systemModule, now)
    && companyModule?.isEnabled === true
    && companyModule?.isActive === true;
}

export function buildOperationalModuleSet(
  modules: SystemModuleState[],
  now = new Date(),
): Set<string> {
  return new Set(
    modules
      .filter((module) => isSystemModuleOperational(module, now))
      .map((module) => module.code.toLowerCase()),
  );
}
