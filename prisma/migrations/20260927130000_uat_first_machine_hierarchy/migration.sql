-- Stage 2 clean UAT commissioning: first industrial machine and deep component hierarchy.
-- Runs only in the designated staging database after organizational commissioning,
-- and only while no asset records exist.

DO $$
DECLARE
  v_plant_id text;
  v_prod_dept_id text;
  v_admin_id text;
  v_asset_count integer;
BEGIN
  IF current_database() <> 'lightworld_iassetspro_db' THEN
    RAISE NOTICE 'UAT first-machine commissioning skipped for database %', current_database();
    RETURN;
  END IF;

  SELECT "id" INTO v_plant_id
  FROM "plants"
  WHERE "code" = 'TEMA-UAT-01'
  LIMIT 1;

  IF v_plant_id IS NULL THEN
    RAISE EXCEPTION 'UAT first-machine commissioning requires plant TEMA-UAT-01';
  END IF;

  SELECT COUNT(*) INTO v_asset_count FROM "assets";
  IF v_asset_count <> 0 THEN
    RAISE NOTICE 'UAT first-machine commissioning skipped: assets already exist (%)', v_asset_count;
    RETURN;
  END IF;

  SELECT "id" INTO v_prod_dept_id
  FROM "departments"
  WHERE "plantId" = v_plant_id AND "code" = 'PROD'
  LIMIT 1;

  IF v_prod_dept_id IS NULL THEN
    RAISE EXCEPTION 'UAT first-machine commissioning requires PROD department';
  END IF;

  SELECT "id" INTO v_admin_id
  FROM "users"
  WHERE "username" = 'admin'
  LIMIT 1;

  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'UAT first-machine commissioning requires admin user';
  END IF;

  INSERT INTO "asset_categories" (
    "id","name","code","description","parentId","isActive","createdAt","updatedAt"
  ) VALUES (
    'uat_cat_printing_machinery',
    'Printing Machinery',
    'PRINTING-MACHINERY',
    'Industrial rotary, flexographic, gravure and related production printing machinery',
    NULL,
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ("code") DO NOTHING;

  INSERT INTO "assets" (
    "id","name","assetTag","description","categoryId","serialNumber","manufacturer","model",
    "yearManufactured","condition","status","criticality","location","building","floor","area",
    "plantId","departmentId","installedDate","expectedLifeYears","specification","parentId",
    "isActive","createdById","assignedToId","createdAt","updatedAt"
  ) VALUES (
    'uat_asset_rotary_printer_01',
    'Rotary Printing Machine RP-01',
    'UAT-RP-001',
    'Clean UAT commissioning machine for validating full industrial EAM asset, component, PM, inventory and repairs workflows.',
    'uat_cat_printing_machinery',
    'UAT-RP01-SN001',
    'Industrial UAT Manufacturer',
    'RP-6000',
    2022,
    'good',
    'operational',
    'critical',
    'Production Hall A',
    'Main Production Building',
    'Ground',
    'Printing Line 1',
    v_plant_id,
    v_prod_dept_id,
    DATE '2023-01-15',
    20,
    '{"machineType":"rotary_printing_machine","ratedSpeedMpm":300,"webWidthMm":1600,"powerSupply":"415V 3-phase 50Hz","commissioningPurpose":"clean_uat"}',
    NULL,
    true,
    v_admin_id,
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );

  INSERT INTO "component_registry" (
    "id","parentId","assetId","twinId","componentCode","name","description","componentType",
    "manufacturer","modelNumber","serialNumber","specification","operatingParams","criticality",
    "lifecycleStatus","installedDate","expectedLifeHours","operatingHours","lastInspection",
    "nextInspectionDue","healthScore","sortOrder","notes"
  ) VALUES
  (
    'uat_comp_printing_unit',
    NULL,
    'uat_asset_rotary_printer_01',
    NULL,
    'RP01-ASM-PRINT',
    'Printing Unit Assembly',
    'Primary print station assembly including impression, plate and drive elements.',
    'assembly',
    'Industrial UAT Manufacturer',
    'PU-1600',
    NULL,
    '{"stationCount":6,"webWidthMm":1600}',
    '{"normalSpeedMpm":250,"maxSpeedMpm":300}',
    'critical',
    'operational',
    DATE '2023-01-15',
    80000,
    12500,
    NULL,
    NULL,
    100,
    10,
    'Top-level assembly for clean UAT hierarchy validation.'
  ),
  (
    'uat_comp_impression_cylinder',
    'uat_comp_printing_unit',
    'uat_asset_rotary_printer_01',
    NULL,
    'RP01-SUB-IMPCYL',
    'Impression Cylinder Sub-Assembly',
    'Impression cylinder, shaft and bearing support sub-assembly.',
    'subassembly',
    'Industrial UAT Manufacturer',
    'IC-1600',
    'UAT-IC-001',
    '{"diameterMm":420,"faceWidthMm":1650}',
    '{"normalRpm":320,"bearingTemperatureMaxC":80}',
    'critical',
    'operational',
    DATE '2023-01-15',
    50000,
    12500,
    NULL,
    NULL,
    100,
    20,
    'Nested under Printing Unit Assembly.'
  ),
  (
    'uat_comp_bearing_housing_ds',
    'uat_comp_impression_cylinder',
    'uat_asset_rotary_printer_01',
    NULL,
    'RP01-CMP-BH-DS',
    'Drive-Side Bearing Housing',
    'Drive-side bearing housing supporting the impression cylinder shaft.',
    'component',
    'Industrial UAT Manufacturer',
    'BH-420-DS',
    'UAT-BH-DS-001',
    '{"housingType":"split_plummer_block","shaftDiameterMm":90}',
    '{"temperatureAlarmC":75,"vibrationAlarmMmS":4.5}',
    'high',
    'operational',
    DATE '2023-01-15',
    40000,
    12500,
    NULL,
    NULL,
    100,
    30,
    'Component-level maintenance target.'
  ),
  (
    'uat_part_bearing_ds',
    'uat_comp_bearing_housing_ds',
    'uat_asset_rotary_printer_01',
    NULL,
    'RP01-PRT-BRG-DS',
    'Drive-Side Spherical Roller Bearing',
    'Replaceable spherical roller bearing installed in the drive-side housing.',
    'part',
    'SKF',
    '22218 E',
    NULL,
    '{"bearingType":"spherical_roller","boreMm":90,"outerDiameterMm":160,"widthMm":40}',
    '{"lubricant":"EP2 grease","temperatureMaxC":80}',
    'critical',
    'operational',
    DATE '2023-01-15',
    20000,
    12500,
    NULL,
    NULL,
    100,
    40,
    'Part-level PM and spare lifecycle UAT target.'
  );

  RAISE NOTICE 'UAT stage 2 commissioned machine %, components %',
    (SELECT COUNT(*) FROM "assets" WHERE "id"='uat_asset_rotary_printer_01'),
    (SELECT COUNT(*) FROM "component_registry" WHERE "assetId"='uat_asset_rotary_printer_01');
END $$;
