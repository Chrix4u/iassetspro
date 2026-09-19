-- Bootstrap the already-in-use Repairs/RWOP domain into the explicit module registry.
-- This migration intentionally does not touch PM Maintenance (pm_schedules).
INSERT INTO `system_modules` (
  `id`, `code`, `name`, `description`, `version`,
  `isCore`, `isSystemLicensed`, `licenseKey`,
  `validFrom`, `validUntil`, `createdAt`, `updatedAt`
)
SELECT
  CONCAT('mod_repairs_', REPLACE(UUID(), '-', '')),
  'repairs',
  'Repairs Maintenance',
  'Corrective repairs/RWOP execution, resource custody, completion, closure, analytics, and reporting workflows',
  '2.0.0',
  0,
  1,
  NULL,
  NOW(3),
  '2099-12-31 23:59:59.999',
  NOW(3),
  NOW(3)
WHERE NOT EXISTS (
  SELECT 1 FROM `system_modules` WHERE `code` = 'repairs'
);

-- Existing installations were already operating Repairs before module-level
-- licensing was introduced. Preserve that existing capability by creating the
-- default company activation only when the Repairs system license is valid and
-- no default activation exists yet.
INSERT INTO `company_modules` (
  `id`, `systemModuleId`, `companyId`, `isActive`, `isEnabled`,
  `licensedAt`, `licensedBy`, `activatedAt`, `activatedBy`,
  `activationLocked`, `createdAt`, `updatedAt`
)
SELECT
  CONCAT('cmp_repairs_', REPLACE(UUID(), '-', '')),
  sm.`id`,
  NULL,
  1,
  1,
  NOW(3),
  NULL,
  NOW(3),
  NULL,
  0,
  NOW(3),
  NOW(3)
FROM `system_modules` sm
WHERE sm.`code` = 'repairs'
  AND sm.`isSystemLicensed` = 1
  AND (sm.`validFrom` IS NULL OR sm.`validFrom` <= NOW(3))
  AND (sm.`validUntil` IS NULL OR sm.`validUntil` >= NOW(3))
  AND NOT EXISTS (
    SELECT 1
    FROM `company_modules` cm
    WHERE cm.`systemModuleId` = sm.`id`
      AND cm.`companyId` IS NULL
  );
