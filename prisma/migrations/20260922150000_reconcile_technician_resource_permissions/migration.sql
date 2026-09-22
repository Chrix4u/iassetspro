-- Ensure the built-in maintenance technician execution role can use the
-- WO-scoped material/tool request workflow in existing production databases.
-- This is additive only: it does not delete/custom-reset any role mappings,
-- and user-level direct permission denies continue to override role grants.

INSERT INTO permissions
  (id, slug, name, module, action, description, createdAt, updatedAt)
VALUES
  (CONCAT('perm_', REPLACE(UUID(), '-', '')), 'tools.view', 'Tools - View', 'tools', 'view', 'View access for Tools module', NOW(), NOW()),
  (CONCAT('perm_', REPLACE(UUID(), '-', '')), 'work_orders.view_own', 'Work Orders - View Own', 'work_orders', 'view_own', 'View Own access for Work Orders module', NOW(), NOW()),
  (CONCAT('perm_', REPLACE(UUID(), '-', '')), 'work_orders.update', 'Work Orders - Update', 'work_orders', 'update', 'Update access for Work Orders module', NOW(), NOW()),
  (CONCAT('perm_', REPLACE(UUID(), '-', '')), 'work_orders.start', 'Work Orders - Start', 'work_orders', 'start', 'Start access for Work Orders module', NOW(), NOW()),
  (CONCAT('perm_', REPLACE(UUID(), '-', '')), 'repair_tool_requests.view_own', 'Repair Tool Requests - View Own', 'repair_tool_requests', 'view_own', 'View Own access for Repair Tool Requests module', NOW(), NOW()),
  (CONCAT('perm_', REPLACE(UUID(), '-', '')), 'repair_tool_requests.create', 'Repair Tool Requests - Create', 'repair_tool_requests', 'create', 'Create access for Repair Tool Requests module', NOW(), NOW()),
  (CONCAT('perm_', REPLACE(UUID(), '-', '')), 'repair_material_requests.view_own', 'Repair Material Requests - View Own', 'repair_material_requests', 'view_own', 'View Own access for Repair Material Requests module', NOW(), NOW()),
  (CONCAT('perm_', REPLACE(UUID(), '-', '')), 'repair_material_requests.create', 'Repair Material Requests - Create', 'repair_material_requests', 'create', 'Create access for Repair Material Requests module', NOW(), NOW())
ON DUPLICATE KEY UPDATE
  name = VALUES(name),
  module = VALUES(module),
  action = VALUES(action),
  description = VALUES(description),
  updatedAt = NOW();

INSERT INTO role_permissions (id, roleId, permissionId, createdAt)
SELECT
  CONCAT('rp_', REPLACE(UUID(), '-', '')),
  r.id,
  p.id,
  NOW()
FROM roles r
JOIN permissions p
  ON p.slug IN (
    'tools.view',
    'work_orders.view_own',
    'work_orders.update',
    'work_orders.start',
    'repair_tool_requests.view_own',
    'repair_tool_requests.create',
    'repair_material_requests.view_own',
    'repair_material_requests.create'
  )
LEFT JOIN role_permissions rp
  ON rp.roleId = r.id
 AND rp.permissionId = p.id
WHERE r.slug = 'maintenance_technician'
  AND rp.id IS NULL;
