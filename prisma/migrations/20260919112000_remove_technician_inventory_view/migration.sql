-- Maintenance technicians use the scoped RWOP material catalog instead of the full Inventory module.
DELETE rp
FROM `role_permissions` rp
INNER JOIN `roles` r ON r.`id` = rp.`roleId`
INNER JOIN `permissions` p ON p.`id` = rp.`permissionId`
WHERE r.`slug` = 'maintenance_technician'
  AND p.`slug` = 'inventory.view';
