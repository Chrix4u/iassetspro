-- One-time clean UAT organizational commissioning for the current staging database.
-- Applies only when demo users exist and no plant has been commissioned yet.
DO $$
DECLARE
  v_user_count integer;
  v_plant_count integer;
BEGIN
  SELECT COUNT(*) INTO v_user_count FROM "users";
  SELECT COUNT(*) INTO v_plant_count FROM "plants";

  IF current_database() = 'lightworld_iassetspro_db'
     AND v_user_count > 0
     AND v_plant_count = 0 THEN

    INSERT INTO "plants" (
      "id","name","code","location","country","city","isActive","createdAt","updatedAt"
    ) VALUES (
      'uat_plant_tema_01',
      'Tema Industrial UAT Plant',
      'TEMA-UAT-01',
      'Tema Industrial Area',
      'Ghana',
      'Tema',
      true,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    );

    INSERT INTO "departments" (
      "id","name","code","plantId","parentId","supervisorId","createdAt","updatedAt"
    ) VALUES
      ('uat_dept_maint','Maintenance','MAINT','uat_plant_tema_01',NULL,(SELECT "id" FROM "users" WHERE "username"='maint_mgr1' LIMIT 1),CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
      ('uat_dept_prod','Production','PROD','uat_plant_tema_01',NULL,(SELECT "id" FROM "users" WHERE "username"='prod_mgr1' LIMIT 1),CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
      ('uat_dept_eng','Engineering','ENG','uat_plant_tema_01',NULL,(SELECT "id" FROM "users" WHERE "username"='iot1' LIMIT 1),CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
      ('uat_dept_whl','Warehouse & Logistics','WHL','uat_plant_tema_01',NULL,(SELECT "id" FROM "users" WHERE "username"='inv_mgr1' LIMIT 1),CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
      ('uat_dept_qc','Quality Control','QC','uat_plant_tema_01',NULL,(SELECT "id" FROM "users" WHERE "username"='qual_mgr1' LIMIT 1),CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
      ('uat_dept_hse','Health Safety & Environment','HSE','uat_plant_tema_01',NULL,(SELECT "id" FROM "users" WHERE "username"='safety1' LIMIT 1),CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
      ('uat_dept_util','Utilities','UTIL','uat_plant_tema_01',NULL,NULL,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
      ('uat_dept_hr','Human Resources','HR','uat_plant_tema_01',NULL,(SELECT "id" FROM "users" WHERE "username"='hr1' LIMIT 1),CURRENT_TIMESTAMP,CURRENT_TIMESTAMP);

    INSERT INTO "user_plants" (
      "id","userId","plantId","accessLevel","isPrimary","createdAt"
    )
    SELECT
      'uat_up_' || substr(md5(u."id" || 'uat_plant_tema_01'),1,20),
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
      true,
      CURRENT_TIMESTAMP
    FROM "users" u;

    UPDATE "user_plants"
    SET "isPrimary" = ("plantId" = 'uat_plant_tema_01')
    WHERE "userId" IN (SELECT "id" FROM "users");

    RAISE NOTICE 'Clean UAT commissioning created plant %, departments %, user assignments %',
      (SELECT COUNT(*) FROM "plants" WHERE "code"='TEMA-UAT-01'),
      (SELECT COUNT(*) FROM "departments" WHERE "plantId"='uat_plant_tema_01'),
      (SELECT COUNT(*) FROM "user_plants" WHERE "plantId"='uat_plant_tema_01');
  ELSE
    RAISE NOTICE 'Clean UAT commissioning skipped: database=%, users=%, plants=%',
      current_database(), v_user_count, v_plant_count;
  END IF;
END $$;
