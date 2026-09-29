-- One-time clean UAT organizational commissioning using plain PostgreSQL.
-- On empty CI databases there are no users, so every INSERT is a no-op.
-- On the current staging database users exist and plants are empty, so this runs once.

-- Refuse commissioning if this is the target state (users exist, no plants)
-- but any operational records already exist.
SELECT 1 / CASE
  WHEN (
    EXISTS (SELECT 1 FROM "users")
    AND NOT EXISTS (SELECT 1 FROM "plants")
    AND (
      (SELECT COUNT(*) FROM "assets")
      + (SELECT COUNT(*) FROM "inventory_items")
      + (SELECT COUNT(*) FROM "tools")
      + (SELECT COUNT(*) FROM "work_orders")
      + (SELECT COUNT(*) FROM "maintenance_requests")
      + (SELECT COUNT(*) FROM "pm_schedules")
      + (SELECT COUNT(*) FROM "installed_spare_parts")
    ) <> 0
  )
  THEN 0
  ELSE 1
END AS "clean_uat_precondition";

INSERT INTO "plants" (
  "id", "name", "code", "location", "country", "city",
  "isActive", "createdAt", "updatedAt"
)
SELECT
  'uat_plant_tema_01',
  'Tema Industrial UAT Plant',
  'TEMA-UAT-01',
  'Tema Industrial Area',
  'Ghana',
  'Tema',
  TRUE,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
WHERE EXISTS (SELECT 1 FROM "users")
  AND NOT EXISTS (SELECT 1 FROM "plants");

INSERT INTO "departments" (
  "id", "name", "code", "plantId", "parentId", "supervisorId",
  "createdAt", "updatedAt"
)
SELECT *
FROM (
  VALUES
    ('uat_dept_maint', 'Maintenance', 'MAINT', 'uat_plant_tema_01', NULL::TEXT, (SELECT "id" FROM "users" WHERE "username" = 'maint_mgr1' LIMIT 1), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('uat_dept_prod', 'Production', 'PROD', 'uat_plant_tema_01', NULL::TEXT, (SELECT "id" FROM "users" WHERE "username" = 'prod_mgr1' LIMIT 1), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('uat_dept_eng', 'Engineering', 'ENG', 'uat_plant_tema_01', NULL::TEXT, (SELECT "id" FROM "users" WHERE "username" = 'iot1' LIMIT 1), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('uat_dept_whl', 'Warehouse & Logistics', 'WHL', 'uat_plant_tema_01', NULL::TEXT, (SELECT "id" FROM "users" WHERE "username" = 'inv_mgr1' LIMIT 1), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('uat_dept_qc', 'Quality Control', 'QC', 'uat_plant_tema_01', NULL::TEXT, (SELECT "id" FROM "users" WHERE "username" = 'qual_mgr1' LIMIT 1), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('uat_dept_hse', 'Health Safety & Environment', 'HSE', 'uat_plant_tema_01', NULL::TEXT, (SELECT "id" FROM "users" WHERE "username" = 'safety1' LIMIT 1), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('uat_dept_util', 'Utilities', 'UTIL', 'uat_plant_tema_01', NULL::TEXT, NULL::TEXT, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
    ('uat_dept_hr', 'Human Resources', 'HR', 'uat_plant_tema_01', NULL::TEXT, (SELECT "id" FROM "users" WHERE "username" = 'hr1' LIMIT 1), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
) AS d("id","name","code","plantId","parentId","supervisorId","createdAt","updatedAt")
WHERE EXISTS (
  SELECT 1 FROM "plants"
  WHERE "id" = 'uat_plant_tema_01' AND "code" = 'TEMA-UAT-01'
)
  AND NOT EXISTS (
    SELECT 1 FROM "departments" existing WHERE existing."id" = d."id"
  );

UPDATE "user_plants"
SET "isPrimary" = FALSE
WHERE EXISTS (
  SELECT 1 FROM "plants"
  WHERE "id" = 'uat_plant_tema_01' AND "code" = 'TEMA-UAT-01'
)
  AND "userId" IN (SELECT "id" FROM "users");

INSERT INTO "user_plants" (
  "id", "userId", "plantId", "accessLevel", "isPrimary", "createdAt"
)
SELECT
  'uat_up_' || SUBSTRING(MD5(u."id" || 'uat_plant_tema_01') FROM 1 FOR 20),
  u."id",
  'uat_plant_tema_01',
  CASE
    WHEN EXISTS (
      SELECT 1
      FROM "user_roles" ur
      JOIN "roles" r ON r."id" = ur."roleId"
      WHERE ur."userId" = u."id" AND r."slug" = 'admin'
    ) THEN 'admin'
    ELSE 'write'
  END,
  TRUE,
  CURRENT_TIMESTAMP
FROM "users" u
WHERE EXISTS (
  SELECT 1 FROM "plants"
  WHERE "id" = 'uat_plant_tema_01' AND "code" = 'TEMA-UAT-01'
)
ON CONFLICT ("userId", "plantId") DO UPDATE SET
  "accessLevel" = EXCLUDED."accessLevel",
  "isPrimary" = TRUE;

-- Transactional verification. These statements intentionally fail with
-- division-by-zero if the commissioned state is inconsistent.
SELECT 1 / CASE
  WHEN NOT EXISTS (
    SELECT 1 FROM "plants"
    WHERE "id" = 'uat_plant_tema_01' AND "code" = 'TEMA-UAT-01'
  )
  OR (SELECT COUNT(*) FROM "departments" WHERE "plantId" = 'uat_plant_tema_01') = 8
  THEN 1 ELSE 0
END AS "department_verification";

SELECT 1 / CASE
  WHEN NOT EXISTS (
    SELECT 1 FROM "plants"
    WHERE "id" = 'uat_plant_tema_01' AND "code" = 'TEMA-UAT-01'
  )
  OR (
    (SELECT COUNT(*) FROM "user_plants" WHERE "plantId" = 'uat_plant_tema_01')
    = (SELECT COUNT(*) FROM "users")
    AND
    (SELECT COUNT(*) FROM "user_plants" WHERE "plantId" = 'uat_plant_tema_01' AND "isPrimary" = TRUE)
    = (SELECT COUNT(*) FROM "users")
  )
  THEN 1 ELSE 0
END AS "user_assignment_verification";
