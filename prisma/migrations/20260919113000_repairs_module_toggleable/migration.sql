-- Repairs is a separately licensed/toggleable business module, not a
-- platform-kernel module. Existing installations may have been bootstrapped
-- with isCore=true by the legacy ensure-repairs endpoint.
UPDATE `system_modules`
SET `isCore` = 0
WHERE `code` = 'repairs';
