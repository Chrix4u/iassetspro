-- Ensure Repairs Maintenance is a first-class module on existing installations.
-- Existing activation choices are preserved: this only creates missing records.

INSERT INTO `system_modules`
  (`id`, `code`, `name`, `description`, `version`, `isCore`, `isSystemLicensed`, `validFrom`, `validUntil`, `createdAt`, `updatedAt`)
VALUES
  ('module_repairs_core', 'repairs', 'Repairs Maintenance',
   'Corrective and emergency repairs, resource requests, downtime, execution, and completion workflows',
   '2.0.0', TRUE, TRUE, NULL, NULL, NOW(3), NOW(3))
ON DUPLICATE KEY UPDATE
  `name` = VALUES(`name`),
  `description` = VALUES(`description`),
  `updatedAt` = NOW(3);

INSERT INTO `company_modules`
  (`id`, `systemModuleId`, `companyId`, `isActive`, `isEnabled`, `licensedAt`, `licensedBy`, `activatedAt`, `activatedBy`, `activationLocked`, `createdAt`, `updatedAt`)
SELECT
  'company_module_repairs_default',
  sm.`id`,
  '__default__',
  TRUE,
  TRUE,
  NOW(3),
  NULL,
  NOW(3),
  NULL,
  FALSE,
  NOW(3),
  NOW(3)
FROM `system_modules` sm
WHERE sm.`code` = 'repairs'
  AND NOT EXISTS (
    SELECT 1
    FROM `company_modules` cm
    WHERE cm.`systemModuleId` = sm.`id`
      AND (cm.`companyId` = '__default__' OR cm.`companyId` IS NULL)
  );
