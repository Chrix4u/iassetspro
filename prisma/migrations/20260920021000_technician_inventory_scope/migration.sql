-- Maintenance technicians use WO-scoped material/tool lookup inside Repairs.
-- They must not inherit full Inventory module access.
DELETE rp
FROM role_permissions rp
JOIN roles r ON r.id = rp.roleId
JOIN permissions p ON p.id = rp.permissionId
WHERE r.slug = 'maintenance_technician'
  AND p.slug IN ('inventory.view', 'parts.view');
