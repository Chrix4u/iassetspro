-- Tools is an optional operational module, but this EAM installation already
-- uses tool custody, planner recommendations, technician requests/transfers,
-- and personal-tool workflows inside Repairs/RWOP.
--
-- Keep Tools disableable (isCore = 0), while explicitly licensing and
-- activating it for the existing installation so the global module gate
-- correctly permits RWOP tool APIs.

INSERT INTO `system_modules` (
  `id`, `code`, `name`, `description`, `version`,
  `isCore`, `isSystemLicensed`, `licenseKey`,
  `validFrom`, `validUntil`, `createdAt`, `updatedAt`
)
SELECT
  CONCAT('mod_tools_', REPLACE(UUID(), '-', '')),
  'tools',
  'Tool Management',
  'Tool inventory, calibration tracking, assignment, availability, custody, requests, transfers, and returns',
  '1.0.0',
  0,
  1,
  NULL,
  NOW(3),
  '2099-12-31 23:59:59.999',
  NOW(3),
  NOW(3)
WHERE NOT EXISTS (
  SELECT 1 FROM `system_modules` WHERE `code` = 'tools'
);

UPDATE `system_modules`
SET
  `isCore` = 0,
  `isSystemLicensed` = 1,
  `validFrom` = COALESCE(`validFrom`, NOW(3)),
  `validUntil` = COALESCE(`validUntil`, '2099-12-31 23:59:59.999'),
  `updatedAt` = NOW(3)
WHERE `code` = 'tools';

-- The application prefers the deterministic '__default__' company-module row.
INSERT INTO `company_modules` (
  `id`, `systemModuleId`, `companyId`, `isActive`, `isEnabled`,
  `licensedAt`, `licensedBy`, `activatedAt`, `activatedBy`,
  `activationLocked`, `createdAt`, `updatedAt`
)
SELECT
  CONCAT('cm_tools_', REPLACE(UUID(), '-', '')),
  sm.`id`,
  '__default__',
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
WHERE sm.`code` = 'tools'
  AND NOT EXISTS (
    SELECT 1
    FROM `company_modules` cm
    WHERE cm.`systemModuleId` = sm.`id`
      AND cm.`companyId` = '__default__'
  );

-- Repair a stale/disabled default activation on existing deployments.
UPDATE `company_modules` cm
JOIN `system_modules` sm ON sm.`id` = cm.`systemModuleId`
SET
  cm.`isActive` = 1,
  cm.`isEnabled` = 1,
  cm.`licensedAt` = COALESCE(cm.`licensedAt`, NOW(3)),
  cm.`activatedAt` = COALESCE(cm.`activatedAt`, NOW(3)),
  cm.`updatedAt` = NOW(3)
WHERE sm.`code` = 'tools'
  AND cm.`companyId` = '__default__';
