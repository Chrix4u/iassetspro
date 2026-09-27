-- Repair the canonical clean-UAT organization prerequisite without deleting
-- any existing staging plants. This migration is intentionally idempotent.
DO $$
DECLARE
  v_plant_id text;
BEGIN
  IF current_database() <> 'lightworld_iassetspro_db' THEN
    RAISE NOTICE 'Canonical UAT organization skipped for database %', current_database();
    RETURN;
  END IF;

  SELECT "id" INTO v_plant_id
  FROM "plants"
  WHERE "code" = 'TEMA-UAT-01'
  LIMIT 1;

  IF v_plant_id IS NULL THEN
    v_plant_id := 'uat_plant_tema_01';
    INSERT INTO "plants" (
      "id","name","code","location","country","city","isActive","createdAt","updatedAt"
    ) VALUES (
      v_plant_id,
      'Tema Industrial UAT Plant',
      'TEMA-UAT-01',
      'Tema Industrial Area',
      'Ghana',
      'Tema',
      true,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    );
  END IF;

  INSERT INTO "departments" (
    "id","name","code","plantId","parentId","supervisorId","createdAt","updatedAt"
  )
  SELECT *
  FROM (VALUES
    ('uat_dept_maint','Maintenance','MAINT',v_plant_id,NULL::text,NULL::text,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
    ('uat_dept_prod','Production','PROD',v_plant_id,NULL::text,NULL::text,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
    ('uat_dept_eng','Engineering','ENG',v_plant_id,NULL::text,NULL::text,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
    ('uat_dept_whl','Warehouse & Logistics','WHL',v_plant_id,NULL::text,NULL::text,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
    ('uat_dept_qc','Quality Control','QC',v_plant_id,NULL::text,NULL::text,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
    ('uat_dept_hse','Health Safety & Environment','HSE',v_plant_id,NULL::text,NULL::text,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
    ('uat_dept_util','Utilities','UTIL',v_plant_id,NULL::text,NULL::text,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
    ('uat_dept_hr','Human Resources','HR',v_plant_id,NULL::text,NULL::text,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  ) AS d("id","name","code","plantId","parentId","supervisorId","createdAt","updatedAt")
  WHERE NOT EXISTS (
    SELECT 1 FROM "departments" existing
    WHERE existing."plantId" = v_plant_id AND existing."code" = d."code"
  );

  INSERT INTO "user_plants" (
    "id","userId","plantId","accessLevel","isPrimary","createdAt"
  )
  SELECT
    'uat_up_' || substr(md5(u."id" || v_plant_id),1,20),
    u."id",
    v_plant_id,
    CASE
      WHEN u."username" = 'admin' THEN 'admin'
      ELSE 'write'
    END,
    false,
    CURRENT_TIMESTAMP
  FROM "users" u
  WHERE NOT EXISTS (
    SELECT 1 FROM "user_plants" up
    WHERE up."userId" = u."id" AND up."plantId" = v_plant_id
  );

  RAISE NOTICE 'Canonical UAT organization ready: plant %, departments %, assignments %',
    (SELECT COUNT(*) FROM "plants" WHERE "id" = v_plant_id),
    (SELECT COUNT(*) FROM "departments" WHERE "plantId" = v_plant_id),
    (SELECT COUNT(*) FROM "user_plants" WHERE "plantId" = v_plant_id);
END $$;
