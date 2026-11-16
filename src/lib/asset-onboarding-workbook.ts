/** Excel machine commissioning workbook: stable headers; do not rely on column positions. */
export const ONBOARDING_SHEETS={
  Machines:['machineCode','machineName','plantCode','categoryCode','locationCode','manufacturer','model','serialNumber','criticality','description'],
  Parts:['machineCode','componentCode','name','componentType','parentCode','manufacturer','modelNumber','criticality','description'],
  Parameters:['ownerType','ownerCode','name','inspectionType','unit','min','max','reference'],
  Meters:['ownerType','ownerCode','name','meterType','unit','initialValue'],
  Visuals:['ownerType','ownerCode','visualType','title','imageUrl','reference'],
} as const;
export type SheetName=keyof typeof ONBOARDING_SHEETS;
export const ONBOARDING_INSTRUCTIONS=[
  ['iAssetsPro | Factory Machine Commissioning','Instructions'],
  ['Workbook version','1.0 | codes must be preserved as text'],
  ['1. Machine Codes','Unique factory machine identifiers. Do not reuse existing asset tags.'],
  ['2. Location Codes','Use the existing iAssetsPro coded hierarchy path. The target must be assignable and belong to the selected plant.'],
  ['3. Part Codes','Each part/component has a unique code in the system; parentCode refers to its parent part within the same machine.'],
  ['4. Parameter Owners','ownerType = machine or part; ownerCode = machineCode or componentCode.'],
  ['5. Manufacturer Limits','Enter real min/max values and units ONLY when known. For visual checks, use inspectionType=visual and describe the criterion in reference.'],
  ['6. Meter Owners','ownerType = machine or part. Initial values must be observed from the actual meter, not inferred.'],
  ['7. Visuals','Optional URLs for genuine OEM photos, plant photos, and engineering diagrams. Use approved URLs and do not treat AI pictures as verified as-built geometry.'],
  ['8. Import','Upload this workbook, inspect the validation preview, and confirm. An invalid workbook creates no records.'],
  ['9. Examples','Examples are isolated on the Examples sheet; do NOT copy them blindly into live data.'],
  ['Supported component types','assembly, subassembly, component, part, auxiliary, instrument'],
  ['Supported meter types','runtime, cycles, production, energy, distance, general'],
  ['Supported inspection types','measurement, visual'],
];
export const EXAMPLE_ROWS={
  Machines:[['MC-001','Textile sanding machine','PLANT-CODE','CATEGORY-CODE','PLANT-AREA-LINE','OEM as labeled','Model from nameplate','Actual serial','high','Example only – verify with engineering']],
  Parts:[['MC-001','MC-001-DRIVE','Drive assembly','assembly','','OEM','Model','high','Example hierarchy'],
    ['MC-001','MC-001-MOTOR','Drive motor','component','MC-001-DRIVE','OEM','Motor type','high','Example only']],
  Parameters:[['part','MC-001-MOTOR','Motor bearing temperature','measurement','°C','','','See manufacturer bearing data sheet'],
    ['machine','MC-001','Machine vibration','measurement','mm/s','','','Obtain OEM vibration limits']],
  Meters:[['machine','MC-001','Machine operating hours','runtime','hours','0'],
    ['part','MC-001-MOTOR','Motor cycles','cycles','cycles','0']],
  Visuals:[['machine','MC-001','photo','Actual installation photo','https://your-approved-host/image.jpg','Site maintenance archive']],
} as const;
