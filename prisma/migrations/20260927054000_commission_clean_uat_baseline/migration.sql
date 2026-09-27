-- One-time clean UAT organizational commissioning.
-- CI/brand-new databases have no users when migrations run, so this block is a no-op there.
-- The current staging database has preserved demo identities and zero plants, so it commissions once.

DO $$
DECLARE
  v_user_count INTEGER;
  v_plant_count INTEGER;
  v_plant_id TEXT := 'uat_plant_tema_01';
BEGIN
  SELECT COUNT(*) INTO v_user_count FROM "users";
  SELECT COUNT(*) INTO v_plant_count FROM "plants";

  IF v_user_count > 0 AND v_plant_count = 0 THEN
    INSERT INTO "plants" (
      "id", "name", "code", "location", "country", "city",
      "isActive", "createdAt", "updatedAt"
    )
    VALUES (
      v_plant_id,
      'Tema Industrial UAT Plant',
      'TEMA-UAT-01',
      'Tema Industrial Area',
      'Ghana',
      'Tema',
      TRUE,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    );

    INSERT INTO "departments" (
      "id", "name", "code", "plantId", "parentId", "supervisorId",
      "createdAt", "updatedAt"
    )
    VALUES
      ('uat_dept_maint', 'Maintenance', 'MAINT', v_plant_id, NULL, (SELECT "id" FROM "users" WHERE "username" = 'maint_mgr1' LIMIT 1), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('uat_dept_prod', 'Production', 'PROD', v_plant_id, NULL, (SELECT "id" FROM "users" WHERE "username" = 'prod_mgr1' LIMIT 1), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('uat_dept_eng', 'Engineering', 'ENG', v_plant_id, NULL, (SELECT "id" FROM "users" WHERE "username" = 'iot1' LIMIT 1), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('uat_dept_whl', 'Warehouse & Logistics', 'WHL', v_plant_id, NULL, (SELECT "id" FROM "users" WHERE "username" = 'inv_mgr1' LIMIT 1), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('uat_dept_qc', 'Quality Control', 'QC', v_plant_id, NULL, (SELECT "id" FROM "users" WHERE "username" = 'qual_mgr1' LIMIT 1), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('uat_dept_hse', 'Health Safety & Environment', 'HSE', v_plant_id, NULL, (SELECT "id" FROM "users" WHERE "username" = 'safety1' LIMIT 1), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('uat_dept_util', 'Utilities', 'UTIL', v_plant_id, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('uat_dept_hr', 'Human Resources', 'HR', v_plant_id, NULL, (SELECT "id" FROM "users" WHERE "username" = 'hr1' LIMIT 1), CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

    UPDATE "user_plants"
       SET "isPrimary" = FALSE
     WHERE "userId" IN (SELECT "id" FROM "users");

    INSERT INTO "user_plants" (
      "id", "userId", "plantId", "accessLevel", "isPrimary", "createdAt"
    )
    SELECT
      'uat_up_' || SUBSTRING(MD5(u."id" || v_plant_id) FROM 1 FOR 20),
      u."id",
      v_plant_id,
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
    ON CONFLICT ("userId", "plantId") DO UPDATE SET
      "accessLevel" = EXCLUDED."accessLevel",
      "isPrimary" = TRUE;
  END IF;
END $$;
