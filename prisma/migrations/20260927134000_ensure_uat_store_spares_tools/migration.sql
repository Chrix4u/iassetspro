-- Corrective Stage 3 commissioning: ensure canonical UAT stock/tools without requiring empty inventory tables.
-- Runs only in the designated staging database after the first machine hierarchy exists,
-- and only while inventory/tools are still empty.

DO $$
DECLARE
  v_plant_id text;
  v_admin_id text;
BEGIN
  IF current_database() <> 'lightworld_iassetspro_db' THEN
    RAISE NOTICE 'UAT store commissioning skipped for database %', current_database();
    RETURN;
  END IF;

  SELECT "id" INTO v_plant_id
  FROM "plants"
  WHERE "code" = 'TEMA-UAT-01'
  LIMIT 1;

  IF v_plant_id IS NULL THEN
    RAISE EXCEPTION 'UAT store commissioning requires plant TEMA-UAT-01';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "assets" WHERE "id" = 'uat_asset_rotary_printer_01'
  ) THEN
    RAISE EXCEPTION 'UAT store commissioning requires Rotary Printing Machine RP-01';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM "component_registry" WHERE "id" = 'uat_part_bearing_ds'
  ) THEN
    RAISE EXCEPTION 'UAT store commissioning requires drive-side bearing part';
  END IF;

  IF EXISTS (SELECT 1 FROM "inventory_items" WHERE "itemCode" = 'BRG-SKF-22218-E')
     OR EXISTS (SELECT 1 FROM "tools" WHERE "toolCode" = 'TL-UAT-001') THEN
    RAISE NOTICE 'UAT store commissioning skipped: canonical UAT stock/tools already exist';
    RETURN;
  END IF;

  SELECT "id" INTO v_admin_id
  FROM "users"
  WHERE "username" = 'admin'
  LIMIT 1;

  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'UAT store commissioning requires admin user';
  END IF;

  INSERT INTO "inventory_locations" (
    "id","name","code","type","address","isActive","createdById","createdAt","updatedAt"
  ) VALUES (
    'uat_invloc_main_store',
    'Main Spare Parts Store',
    'UAT-MAIN-STORE',
    'storeroom',
    'Tema Industrial UAT Plant - Main Production Building',
    true,
    v_admin_id,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );

  INSERT INTO "inventory_items" (
    "id","itemCode","name","description","category","unitOfMeasure","currentStock",
    "minStockLevel","maxStockLevel","reorderQuantity","unitCost","supplier",
    "supplierPartNumber","location","binLocation","shelfLocation","plantId",
    "locationId","supplierId","isActive","specification","imageUrls","createdById",
    "createdAt","updatedAt"
  ) VALUES
  (
    'uat_inv_bearing_22218e',
    'BRG-SKF-22218-E',
    'SKF 22218 E Spherical Roller Bearing',
    'Critical replacement bearing for the RP-01 drive-side impression cylinder bearing housing.',
    'spare_part',
    'each',
    6,
    2,
    12,
    6,
    1850,
    'Industrial Bearings Ghana UAT',
    '22218 E',
    'Main Spare Parts Store',
    'B-01-03',
    'B-01',
    v_plant_id,
    'uat_invloc_main_store',
    NULL,
    true,
    '{"bearingType":"spherical_roller","boreMm":90,"outerDiameterMm":160,"widthMm":40,"manufacturer":"SKF"}',
    '[]',
    v_admin_id,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'uat_inv_grease_ep2',
    'LUB-EP2-400G',
    'EP2 Bearing Grease 400g Cartridge',
    'General-purpose EP2 grease for the RP-01 impression cylinder bearing system.',
    'consumable',
    'each',
    24,
    8,
    48,
    24,
    85,
    'Industrial Lubricants Ghana UAT',
    'EP2-400G',
    'Main Spare Parts Store',
    'L-02-04',
    'L-02',
    v_plant_id,
    'uat_invloc_main_store',
    NULL,
    true,
    '{"grade":"EP2","packSize":"400g","application":"rolling_bearings"}',
    '[]',
    v_admin_id,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );

  INSERT INTO "stock_movements" (
    "id","itemId","type","quantity","previousStock","newStock","reason",
    "referenceType","referenceId","performedById","notes","createdAt"
  ) VALUES
  (
    'uat_stock_opening_bearing',
    'uat_inv_bearing_22218e',
    'in',
    6,
    0,
    6,
    'Clean UAT opening balance',
    'commissioning',
    'uat_stage3',
    v_admin_id,
    'Opening balance created with UAT store commissioning.',
    CURRENT_TIMESTAMP
  ),
  (
    'uat_stock_opening_grease',
    'uat_inv_grease_ep2',
    'in',
    24,
    0,
    24,
    'Clean UAT opening balance',
    'commissioning',
    'uat_stage3',
    v_admin_id,
    'Opening balance created with UAT store commissioning.',
    CURRENT_TIMESTAMP
  );

  INSERT INTO "tools" (
    "id","toolCode","name","description","category","serialNumber","status","condition",
    "quantity","location","plantId","purchaseDate","purchaseCost","currentValue",
    "manufacturer","model","assignedToId","checkedOutAt","expectedReturn",
    "isActive","createdById","createdAt","updatedAt"
  ) VALUES
  (
    'uat_tool_bearing_puller',
    'TL-UAT-001',
    'Hydraulic Bearing Puller Set',
    'Hydraulic puller set for removing the RP-01 drive-side bearing.',
    'Special Tool',
    'UAT-TL-BP-001',
    'available',
    'good',
    1,
    'Maintenance Tool Crib',
    v_plant_id,
    DATE '2025-01-10',
    7200,
    6500,
    'UAT Industrial Tools',
    'HP-20T',
    NULL,
    NULL,
    NULL,
    true,
    v_admin_id,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'uat_tool_torque_wrench',
    'TL-UAT-002',
    'Digital Torque Wrench 40-200 Nm',
    'Torque wrench for controlled bearing-housing installation and fastener torque.',
    'Measurement',
    'UAT-TL-TW-001',
    'available',
    'good',
    1,
    'Maintenance Tool Crib',
    v_plant_id,
    DATE '2025-02-05',
    2600,
    2300,
    'UAT Precision Tools',
    'DTW-200',
    NULL,
    NULL,
    NULL,
    true,
    v_admin_id,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  ),
  (
    'uat_tool_dial_indicator',
    'TL-UAT-003',
    'Dial Indicator with Magnetic Base',
    'Measurement tool for runout and alignment checks on RP-01 rotating components.',
    'Measurement',
    'UAT-TL-DI-001',
    'available',
    'good',
    1,
    'Maintenance Tool Crib',
    v_plant_id,
    DATE '2025-02-05',
    1800,
    1600,
    'UAT Precision Tools',
    'DI-10',
    NULL,
    NULL,
    NULL,
    true,
    v_admin_id,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
  );

  INSERT INTO "component_spare_parts" (
    "id","componentId","inventoryItemId","sparePartName","sparePartCode",
    "quantityRequired","unitCost","leadTimeDays","criticality","notes"
  ) VALUES (
    'uat_csp_bearing_ds',
    'uat_part_bearing_ds',
    'uat_inv_bearing_22218e',
    'SKF 22218 E Spherical Roller Bearing',
    'BRG-SKF-22218-E',
    1,
    1850,
    14,
    'critical',
    'Primary stocked replacement bearing for the RP-01 drive-side bearing position.'
  );

  INSERT INTO "component_tool_requirements" (
    "id","componentId","toolId","toolName","toolCode","quantityRequired","taskType","notes"
  ) VALUES
  (
    'uat_ctr_bearing_puller',
    'uat_comp_bearing_housing_ds',
    'uat_tool_bearing_puller',
    'Hydraulic Bearing Puller Set',
    'TL-UAT-001',
    1,
    'overhaul',
    'Required to remove the drive-side impression-cylinder bearing safely.'
  ),
  (
    'uat_ctr_torque_wrench',
    'uat_part_bearing_ds',
    'uat_tool_torque_wrench',
    'Digital Torque Wrench 40-200 Nm',
    'TL-UAT-002',
    1,
    'installation',
    'Required for controlled fastener torque during bearing installation.'
  ),
  (
    'uat_ctr_dial_indicator',
    'uat_comp_bearing_housing_ds',
    'uat_tool_dial_indicator',
    'Dial Indicator with Magnetic Base',
    'TL-UAT-003',
    1,
    'inspection',
    'Required for alignment/runout verification after reassembly.'
  );

  RAISE NOTICE 'UAT stage 3 commissioned inventory %, tools %, spare links %, tool requirements %',
    (SELECT COUNT(*) FROM "inventory_items"),
    (SELECT COUNT(*) FROM "tools"),
    (SELECT COUNT(*) FROM "component_spare_parts" WHERE "componentId"='uat_part_bearing_ds'),
    (SELECT COUNT(*) FROM "component_tool_requirements" WHERE "componentId" IN ('uat_part_bearing_ds','uat_comp_bearing_housing_ds'));
END $$;
