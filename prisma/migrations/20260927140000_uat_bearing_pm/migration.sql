-- Stage 4 clean UAT commissioning: component-level preventive maintenance.
-- Runs only in the designated staging database after the machine/store stages exist,
-- and only while no PM schedules have been commissioned.

DO $$
DECLARE
  v_admin_id text;
  v_tech_id text;
  v_maint_dept_id text;
  v_pm_count integer;
BEGIN
  IF current_database() <> 'lightworld_iassetspro_db' THEN
    RAISE NOTICE 'UAT PM commissioning skipped for database %', current_database();
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "component_registry" WHERE "id" = 'uat_part_bearing_ds'
  ) THEN
    RAISE EXCEPTION 'UAT PM commissioning requires drive-side bearing part';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "inventory_items" WHERE "id" = 'uat_inv_bearing_22218e'
  ) THEN
    RAISE EXCEPTION 'UAT PM commissioning requires stage-3 store/spares baseline';
  END IF;

  SELECT COUNT(*) INTO v_pm_count FROM "pm_schedules";
  IF v_pm_count <> 0 THEN
    RAISE NOTICE 'UAT PM commissioning skipped: PM schedules already exist (%)', v_pm_count;
    RETURN;
  END IF;

  SELECT "id" INTO v_admin_id FROM "users" WHERE "username"='admin' LIMIT 1;
  SELECT "id" INTO v_tech_id FROM "users" WHERE "username"='tech1' LIMIT 1;
  SELECT "id" INTO v_maint_dept_id FROM "departments"
    WHERE "plantId"='uat_plant_tema_01' AND "code"='MAINT' LIMIT 1;

  IF v_admin_id IS NULL OR v_tech_id IS NULL OR v_maint_dept_id IS NULL THEN
    RAISE EXCEPTION 'UAT PM commissioning requires admin, tech1 and MAINT department';
  END IF;

  INSERT INTO "pm_templates" (
    "id","title","description","type","category","estimatedDuration","priority",
    "requiredSkills","requiredTools","isActive","createdById","createdAt","updatedAt"
  ) VALUES (
    'uat_pmt_bearing_service',
    'RP-01 Drive-Side Bearing 500h Service',
    'Preventive service for the RP-01 drive-side impression-cylinder bearing, including inspection, vibration/temperature checks, lubrication and torque verification.',
    'preventive',
    'mechanical',
    2.5,
    'high',
    '["Mechanical Fitter","Maintenance Technician"]',
    '["Hydraulic Bearing Puller Set","Digital Torque Wrench 40-200 Nm","Dial Indicator with Magnetic Base"]',
    true,
    v_admin_id,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );

  INSERT INTO "pm_template_tasks" (
    "id","templateId","taskNumber","description","taskType","requiredParts",
    "estimatedMinutes","sortOrder","isActive"
  ) VALUES
  (
    'uat_pmtask_bearing_visual',
    'uat_pmt_bearing_service',
    1,
    'Inspect bearing housing, seals, fasteners and surrounding area for leaks, looseness, contamination or abnormal wear.',
    'inspect',
    NULL,
    15,
    10,
    true
  ),
  (
    'uat_pmtask_bearing_temp_vibration',
    'uat_pmt_bearing_service',
    2,
    'Measure bearing temperature and vibration and compare with the configured normal ranges.',
    'measure',
    NULL,
    20,
    20,
    true
  ),
  (
    'uat_pmtask_bearing_runout',
    'uat_pmt_bearing_service',
    3,
    'Check shaft/cylinder runout and alignment using the dial indicator with magnetic base.',
    'measure',
    NULL,
    30,
    30,
    true
  ),
  (
    'uat_pmtask_bearing_lube',
    'uat_pmt_bearing_service',
    4,
    'Lubricate the bearing with EP2 grease using the specified quantity and record operating hours.',
    'lubricate',
    '[{"partName":"EP2 Bearing Grease 400g Cartridge","itemCode":"LUB-EP2-400G","quantity":1,"unit":"cartridge"}]',
    20,
    40,
    true
  ),
  (
    'uat_pmtask_bearing_torque',
    'uat_pmt_bearing_service',
    5,
    'Verify bearing-housing and associated fastener torque using the digital torque wrench.',
    'check',
    NULL,
    30,
    50,
    true
  ),
  (
    'uat_pmtask_bearing_record',
    'uat_pmt_bearing_service',
    6,
    'Record readings, observations, remaining-life concerns and any recommended corrective action.',
    'record',
    NULL,
    10,
    60,
    true
  );

  INSERT INTO "pm_schedules" (
    "id","title","description","assetId","componentId","frequencyType","frequencyValue",
    "lastCompletedDate","nextDueDate","estimatedDuration","priority","assignedToId",
    "departmentId","isActive","autoGenerateWO","leadDays","woTypeId","createdById",
    "createdAt","updatedAt","templateId"
  ) VALUES (
    'uat_pm_bearing_500h',
    'RP-01 Drive-Side Bearing 500h PM',
    'Meter-based preventive maintenance schedule targeting the exact drive-side bearing part.',
    'uat_asset_rotary_printer_01',
    'uat_part_bearing_ds',
    'meter_based',
    500,
    NULL,
    NULL,
    2.5,
    'high',
    v_tech_id,
    v_maint_dept_id,
    true,
    true,
    1,
    NULL,
    v_admin_id,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    'uat_pmt_bearing_service'
  );

  INSERT INTO "pm_triggers" (
    "id","scheduleId","triggerType","triggerValue","triggerConfig",
    "lastTriggeredAt","isActive","createdAt","updatedAt"
  ) VALUES (
    'uat_pmtrg_bearing_500h',
    'uat_pm_bearing_500h',
    'meter',
    500,
    '{"source":"component_operating_hours","componentId":"uat_part_bearing_ds","baselineHours":12500,"unit":"hours"}',
    NULL,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );

  INSERT INTO "component_inspection_points" (
    "id","componentId","name","description","inspectionType","parameterKey",
    "normalRange","frequency","lastInspected","nextInspection","isActive","sortOrder"
  ) VALUES
  (
    'uat_insp_bearing_temp',
    'uat_part_bearing_ds',
    'Bearing Temperature',
    'Measure drive-side bearing temperature at the housing after stable operation.',
    'measurement',
    'bearing_temperature_c',
    '{"min":20,"max":75,"unit":"C"}',
    'weekly',
    NULL,
    CURRENT_TIMESTAMP + INTERVAL '7 days',
    true,
    10
  ),
  (
    'uat_insp_bearing_vibration',
    'uat_part_bearing_ds',
    'Bearing Vibration',
    'Measure RMS vibration velocity at the drive-side bearing housing.',
    'measurement',
    'bearing_vibration_mm_s',
    '{"min":0,"max":4.5,"unit":"mm/s"}',
    'weekly',
    NULL,
    CURRENT_TIMESTAMP + INTERVAL '7 days',
    true,
    20
  );

  INSERT INTO "component_lubrication_schedules" (
    "id","componentId","lubricantType","lubricantName","specification","quantity",
    "unit","frequency","frequencyHours","lastLubricated","nextDueDate","isActive","notes"
  ) VALUES (
    'uat_lube_bearing_500h',
    'uat_part_bearing_ds',
    'grease',
    'EP2 Bearing Grease',
    'NLGI 2 / EP2',
    80,
    'grams',
    'per_hours',
    500,
    NULL,
    NULL,
    true,
    'Use clean grease application practices and record component operating hours at lubrication.'
  );

  RAISE NOTICE 'UAT stage 4 commissioned PM schedules %, templates %, inspection points %, lubrication schedules %',
    (SELECT COUNT(*) FROM "pm_schedules" WHERE "id"='uat_pm_bearing_500h'),
    (SELECT COUNT(*) FROM "pm_templates" WHERE "id"='uat_pmt_bearing_service'),
    (SELECT COUNT(*) FROM "component_inspection_points" WHERE "componentId"='uat_part_bearing_ds'),
    (SELECT COUNT(*) FROM "component_lubrication_schedules" WHERE "componentId"='uat_part_bearing_ds');
END $$;
