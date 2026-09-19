-- Maintenance technicians use the limited repair request catalog and should
-- not inherit full Inventory/Parts browsing from the default system role.
DELETE rp
FROM `role_permissions` rp
INNER JOIN `roles` r ON r.`id` = rp.`roleId`
INNER JOIN `permissions` p ON p.`id` = rp.`permissionId`
WHERE r.`slug` = 'maintenance_technician'
  AND p.`slug` IN ('inventory.view', 'parts.view');
