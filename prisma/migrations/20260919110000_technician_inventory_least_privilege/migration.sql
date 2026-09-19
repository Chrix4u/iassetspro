-- Enforce least-privilege repair execution.
-- Maintenance technicians select materials through the restricted Repairs catalog
-- and must not inherit full Inventory/Parts browsing permissions.
DELETE rp
FROM `role_permissions` rp
JOIN `roles` r ON r.id = rp.roleId
JOIN `permissions` p ON p.id = rp.permissionId
WHERE r.slug = 'maintenance_technician'
  AND p.slug IN ('inventory.view', 'parts.view');
