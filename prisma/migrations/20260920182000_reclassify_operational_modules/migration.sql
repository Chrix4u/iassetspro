-- Reclassify legacy operational modules that were previously marked as core.
-- Only 'core' and 'modules' are control-plane modules that bypass company
-- enable/disable state. Preserve the currently-operational behavior of the
-- legacy modules during this migration so rollout is non-disruptive.

UPDATE `system_modules`
SET `isCore` = 0,
    `isSystemLicensed` = 1
WHERE `code` IN ('assets', 'maintenance_requests', 'work_orders', 'inventory');

UPDATE `system_modules`
SET `isCore` = 1,
    `isSystemLicensed` = 1
WHERE `code` IN ('core', 'modules');

-- Ensure a deterministic default company-module row exists for each
-- reclassified module. The app prefers '__default__' over legacy NULL rows.
INSERT INTO `company_modules`
  (`id`, `systemModuleId`, `companyId`, `isActive`, `isEnabled`,
   `licensedAt`, `licensedBy`, `activatedAt`, `activatedBy`,
   `activationLocked`, `createdAt`, `updatedAt`)
SELECT
  CONCAT('cm_', REPLACE(UUID(), '-', '')),
  sm.`id`,
  '__default__',
  1,
  1,
  COALESCE(sm.`validFrom`, NOW(3)),
  NULL,
  NOW(3),
  NULL,
  0,
  NOW(3),
  NOW(3)
FROM `system_modules` sm
WHERE sm.`code` IN ('assets', 'maintenance_requests', 'work_orders', 'inventory')
  AND NOT EXISTS (
    SELECT 1
    FROM `company_modules` cm
    WHERE cm.`systemModuleId` = sm.`id`
      AND cm.`companyId` = '__default__'
  );

-- Preserve existing installations as enabled/active on first rollout.
-- Administrators may disable them normally after this migration.
UPDATE `company_modules` cm
JOIN `system_modules` sm ON sm.`id` = cm.`systemModuleId`
SET cm.`isActive` = 1,
    cm.`isEnabled` = 1,
    cm.`licensedAt` = COALESCE(cm.`licensedAt`, NOW(3)),
    cm.`activatedAt` = COALESCE(cm.`activatedAt`, NOW(3)),
    cm.`updatedAt` = NOW(3)
WHERE sm.`code` IN ('assets', 'maintenance_requests', 'work_orders', 'inventory')
  AND cm.`companyId` = '__default__';
