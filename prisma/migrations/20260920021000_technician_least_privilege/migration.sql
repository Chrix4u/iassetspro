-- Maintenance technicians use WO-scoped repair catalogs instead of broad registry access.
-- Idempotently remove legacy role-level grants from existing deployments.
DELETE rp
FROM role_permissions rp
JOIN roles r ON r.id = rp.roleId
JOIN permissions p ON p.id = rp.permissionId
WHERE r.slug = 'maintenance_technician'
  AND p.slug IN ('inventory.view', 'parts.view', 'tools.view');
