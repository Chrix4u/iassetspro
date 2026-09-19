-- Least-privilege correction: maintenance technicians request materials through
-- the work-order-scoped Repairs catalog and must not inherit the full Inventory module.
DELETE rp
FROM `role_permissions` rp
INNER JOIN `roles` r ON r.`id` = rp.`roleId`
INNER JOIN `permissions` p ON p.`id` = rp.`permissionId`
WHERE r.`slug` = 'maintenance_technician'
  AND p.`slug` = 'inventory.view';
