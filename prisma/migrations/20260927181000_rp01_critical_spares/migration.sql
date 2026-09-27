-- Commission critical RP-01 spares for the expanded engineering hierarchy.
-- Staging-only and idempotent; preserves all existing inventory.

DO $$
DECLARE
  v_plant_id text;
  v_admin_id text;
  v_loc_id text;
BEGIN
  IF current_database() <> 'lightworld_iassetspro_db' THEN
    RAISE NOTICE 'RP-01 critical spares skipped for database %', current_database();
    RETURN;
  END IF;

  SELECT "id" INTO v_plant_id FROM "plants" WHERE "code"='TEMA-UAT-01' LIMIT 1;
  SELECT "id" INTO v_admin_id FROM "users" WHERE "username"='admin' LIMIT 1;
  SELECT "id" INTO v_loc_id FROM "inventory_locations" WHERE "code"='UAT-MAIN-STORE' LIMIT 1;

  IF v_plant_id IS NULL OR v_admin_id IS NULL OR v_loc_id IS NULL THEN
    RAISE EXCEPTION 'RP-01 critical spares require canonical plant, admin and main store';
  END IF;

  INSERT INTO "inventory_items" (
    "id","itemCode","name","description","category","unitOfMeasure","currentStock",
    "minStockLevel","maxStockLevel","reorderQuantity","unitCost","supplier",
    "supplierPartNumber","location","binLocation","shelfLocation","plantId",
    "locationId","supplierId","isActive","specification","imageUrls","createdById",
    "createdAt","updatedAt"
  ) VALUES
  ('uat_inv_motor_brg_6316','BRG-SKF-6316-C3','SKF 6316 C3 Motor Bearing','Main RP-01 drive motor drive-end bearing.','spare_part','each',4,2,8,4,1350,'Industrial Bearings Ghana UAT','6316-C3','Main Spare Parts Store','B-02-01','B-02',v_plant_id,v_loc_id,NULL,true,'{"manufacturer":"SKF","boreMm":80,"outerDiameterMm":170}','[]',v_admin_id,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('uat_inv_gbx_brg_nu316','BRG-SKF-NU316-ECP','SKF NU316 ECP Gearbox Bearing','RP-01 gearbox input shaft bearing.','spare_part','each',2,1,4,2,2100,'Industrial Bearings Ghana UAT','NU316-ECP','Main Spare Parts Store','B-02-02','B-02',v_plant_id,v_loc_id,NULL,true,'{"manufacturer":"SKF","boreMm":80}','[]',v_admin_id,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('uat_inv_gbx_brg_22220','BRG-SKF-22220-E','SKF 22220 E Gearbox Bearing','RP-01 gearbox output shaft bearing.','spare_part','each',2,1,4,2,2450,'Industrial Bearings Ghana UAT','22220-E','Main Spare Parts Store','B-02-03','B-02',v_plant_id,v_loc_id,NULL,true,'{"manufacturer":"SKF","boreMm":100}','[]',v_admin_id,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('uat_inv_exfan_brg_6309','BRG-SKF-6309-2RS','SKF 6309 2RS Exhaust Fan Bearing','Dryer exhaust fan shaft bearing.','spare_part','each',4,2,8,4,620,'Industrial Bearings Ghana UAT','6309-2RS','Main Spare Parts Store','B-03-01','B-03',v_plant_id,v_loc_id,NULL,true,'{"manufacturer":"SKF","boreMm":45}','[]',v_admin_id,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('uat_inv_exhaust_filter','FLT-F7-600','F7 Dryer Exhaust Pre-Filter','Replaceable RP-01 dryer exhaust filtration element.','consumable','each',12,4,24,12,210,'Industrial Filtration Ghana UAT','F7-600','Main Spare Parts Store','F-01-01','F-01',v_plant_id,v_loc_id,NULL,true,'{"class":"F7"}','[]',v_admin_id,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('uat_inv_pump_seal','KIT-GRACO-1050-PTFE','Graco 1050 PTFE Seal Kit','Wetted diaphragm/seal service kit for RP-01 ink circulation pump.','spare_part','kit',6,2,12,6,780,'Industrial Process Supplies UAT','KIT-1050-PTFE','Main Spare Parts Store','P-01-01','P-01',v_plant_id,v_loc_id,NULL,true,'{"material":"PTFE"}','[]',v_admin_id,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('uat_inv_air_filter','FLT-FESTO-MS6','Festo MS6 Air Filter Element','5 micron replacement filter element for machine FRL unit.','consumable','each',10,4,20,10,165,'Industrial Pneumatics Ghana UAT','MS6-LF-ELEM','Main Spare Parts Store','P-02-01','P-02',v_plant_id,v_loc_id,NULL,true,'{"micron":5}','[]',v_admin_id,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('uat_inv_estop','ELC-XB5-AS844','Emergency Stop Pushbutton XB5-AS844','Replacement latching emergency-stop operator device.','spare_part','each',2,1,4,2,280,'Industrial Controls Ghana UAT','XB5-AS844','Main Spare Parts Store','E-01-01','E-01',v_plant_id,v_loc_id,NULL,true,'{"contacts":"2NC"}','[]',v_admin_id,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('uat_inv_encoder_cpl','CPL-KTR-GS19','KTR ROTEX GS19 Encoder Coupling','Zero-backlash flexible coupling for RP-01 line encoder.','spare_part','each',3,1,6,3,340,'Industrial Motion Ghana UAT','ROTEX-GS-19','Main Spare Parts Store','M-01-01','M-01',v_plant_id,v_loc_id,NULL,true,'{}','[]',v_admin_id,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('uat_inv_plate_brg_22216','BRG-SKF-22216-E','SKF 22216 E Plate Cylinder Bearing','Drive-side bearing for the RP-01 plate cylinder.','spare_part','each',4,2,8,4,1450,'Industrial Bearings Ghana UAT','22216-E','Main Spare Parts Store','B-03-02','B-03',v_plant_id,v_loc_id,NULL,true,'{"manufacturer":"SKF","boreMm":80,"outerDiameterMm":140}','[]',v_admin_id,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
  ON CONFLICT ("itemCode") DO NOTHING;

  INSERT INTO "stock_movements" (
    "id","itemId","type","quantity","previousStock","newStock","reason",
    "referenceType","referenceId","performedById","notes","createdAt"
  )
  SELECT 'uat_stock_deep_' || i."id", i."id", 'in', i."currentStock", 0, i."currentStock",
    'RP-01 deep commissioning opening balance','commissioning','uat_stage_deep_spares',
    v_admin_id,'Opening balance for expanded RP-01 critical spare.',CURRENT_TIMESTAMP
  FROM "inventory_items" i
  WHERE i."id" IN (
    'uat_inv_motor_brg_6316','uat_inv_gbx_brg_nu316','uat_inv_gbx_brg_22220',
    'uat_inv_exfan_brg_6309','uat_inv_exhaust_filter','uat_inv_pump_seal',
    'uat_inv_air_filter','uat_inv_estop','uat_inv_encoder_cpl','uat_inv_plate_brg_22216'
  )
  AND NOT EXISTS (
    SELECT 1 FROM "stock_movements" sm WHERE sm."id"='uat_stock_deep_' || i."id"
  );

  INSERT INTO "component_spare_parts" (
    "id","componentId","inventoryItemId","sparePartName","sparePartCode",
    "quantityRequired","unitCost","leadTimeDays","criticality","notes"
  ) VALUES
  ('uat_csp_motor_brg','uat_part_motor_de_bearing','uat_inv_motor_brg_6316','SKF 6316 C3 Motor Bearing','BRG-SKF-6316-C3',1,1350,14,'critical','Main motor drive-end replacement bearing.'),
  ('uat_csp_gbx_in','uat_part_gbx_input_brg','uat_inv_gbx_brg_nu316','SKF NU316 ECP Gearbox Bearing','BRG-SKF-NU316-ECP',1,2100,21,'critical','Gearbox input bearing.'),
  ('uat_csp_gbx_out','uat_part_gbx_output_brg','uat_inv_gbx_brg_22220','SKF 22220 E Gearbox Bearing','BRG-SKF-22220-E',1,2450,21,'critical','Gearbox output bearing.'),
  ('uat_csp_exfan_brg','uat_part_exfan_brg','uat_inv_exfan_brg_6309','SKF 6309 2RS Exhaust Fan Bearing','BRG-SKF-6309-2RS',1,620,10,'high','Exhaust fan replacement bearing.'),
  ('uat_csp_exfilter','uat_part_exhaust_filter','uat_inv_exhaust_filter','F7 Dryer Exhaust Pre-Filter','FLT-F7-600',1,210,7,'medium','Routine dryer exhaust filter replacement.'),
  ('uat_csp_pump_seal','uat_part_pump_seal','uat_inv_pump_seal','Graco 1050 PTFE Seal Kit','KIT-GRACO-1050-PTFE',1,780,14,'high','Ink pump wet-end service kit.'),
  ('uat_csp_air_filter','uat_part_air_filter','uat_inv_air_filter','Festo MS6 Air Filter Element','FLT-FESTO-MS6',1,165,7,'medium','FRL air-filter service element.'),
  ('uat_csp_estop','uat_part_estop','uat_inv_estop','Emergency Stop Pushbutton XB5-AS844','ELC-XB5-AS844',1,280,14,'critical','Safety-device replacement stock.'),
  ('uat_csp_encoder_cpl','uat_part_encoder_cpl','uat_inv_encoder_cpl','KTR ROTEX GS19 Encoder Coupling','CPL-KTR-GS19',1,340,14,'high','Line encoder flexible coupling.'),
  ('uat_csp_plate_brg','uat_part_plate_bearing_ds','uat_inv_plate_brg_22216','SKF 22216 E Plate Cylinder Bearing','BRG-SKF-22216-E',1,1450,14,'high','Plate cylinder drive-side replacement bearing.')
  ON CONFLICT DO NOTHING;

  INSERT INTO "component_tool_requirements" (
    "id","componentId","toolId","toolName","toolCode","quantityRequired","taskType","notes"
  ) VALUES
  ('uat_ctr_motor_puller','uat_part_motor_de_bearing','uat_tool_bearing_puller','Hydraulic Bearing Puller Set','TL-UAT-001',1,'replacement','Motor drive-end bearing removal.'),
  ('uat_ctr_motor_torque','uat_cmp_main_motor','uat_tool_torque_wrench','Digital Torque Wrench 40-200 Nm','TL-UAT-002',1,'installation','Motor bearing housing and coupling torque verification.'),
  ('uat_ctr_gbx_dial','uat_cmp_gearbox','uat_tool_dial_indicator','Dial Indicator with Magnetic Base','TL-UAT-003',1,'inspection','Gearbox shaft runout/alignment verification.'),
  ('uat_ctr_exfan_puller','uat_part_exfan_brg','uat_tool_bearing_puller','Hydraulic Bearing Puller Set','TL-UAT-001',1,'replacement','Exhaust fan bearing removal.'),
  ('uat_ctr_plate_dial','uat_cmp_plate_shaft','uat_tool_dial_indicator','Dial Indicator with Magnetic Base','TL-UAT-003',1,'inspection','Plate cylinder runout verification.')
  ON CONFLICT DO NOTHING;

  RAISE NOTICE 'RP-01 critical spare commissioning ready: links %, inventory items %',
    (SELECT COUNT(*) FROM "component_spare_parts" WHERE "id" LIKE 'uat_csp_%'),
    (SELECT COUNT(*) FROM "inventory_items" WHERE "id" LIKE 'uat_inv_%');
END $$;
