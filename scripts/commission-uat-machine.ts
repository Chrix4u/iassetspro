import { db } from '../src/lib/db';

const PLANT_CODE = 'TEMA-UAT-01';
const ASSET_TAG = 'UAT-CMP-001';

type ComponentSeed = {
  id: string;
  code: string;
  name: string;
  type: 'assembly' | 'subassembly' | 'component' | 'part';
  parentId?: string;
  criticality: 'medium' | 'high' | 'critical';
  manufacturer?: string;
  modelNumber?: string;
  serialNumber?: string;
  specification?: Record<string, unknown>;
};

const components: ComponentSeed[] = [
  {
    id: 'uat_cmp_assembly_compression',
    code: 'UAT-CMP-A01',
    name: 'Compression Assembly',
    type: 'assembly',
    criticality: 'critical',
    specification: { function: 'compress process air', stageCount: 2 },
  },
  {
    id: 'uat_cmp_subassembly_airend',
    code: 'UAT-CMP-SA01',
    name: 'Air End',
    type: 'subassembly',
    parentId: 'uat_cmp_assembly_compression',
    criticality: 'critical',
    specification: { type: 'rotary screw' },
  },
  {
    id: 'uat_cmp_component_rotorset',
    code: 'UAT-CMP-C01',
    name: 'Rotor Set',
    type: 'component',
    parentId: 'uat_cmp_subassembly_airend',
    criticality: 'critical',
    specification: { rotorType: 'male/female helical pair' },
  },
  {
    id: 'uat_cmp_part_airend_bearing',
    code: 'UAT-CMP-P01',
    name: 'Air-End Drive Bearing',
    type: 'part',
    parentId: 'uat_cmp_component_rotorset',
    criticality: 'high',
    manufacturer: 'SKF',
    modelNumber: 'UAT-6312-C3',
    serialNumber: 'UAT-BRG-6312-0001',
    specification: { bearingType: 'deep groove ball bearing', boreMm: 60 },
  },
  {
    id: 'uat_cmp_part_shaftseal',
    code: 'UAT-CMP-P02',
    name: 'Air-End Shaft Seal',
    type: 'part',
    parentId: 'uat_cmp_component_rotorset',
    criticality: 'high',
    specification: { sealType: 'mechanical lip seal' },
  },
  {
    id: 'uat_cmp_assembly_drive',
    code: 'UAT-CMP-A02',
    name: 'Drive System',
    type: 'assembly',
    criticality: 'critical',
    specification: { driveType: 'direct coupled' },
  },
  {
    id: 'uat_cmp_component_motor',
    code: 'UAT-CMP-C02',
    name: 'Main Electric Motor',
    type: 'component',
    parentId: 'uat_cmp_assembly_drive',
    criticality: 'critical',
    manufacturer: 'ABB',
    modelNumber: 'UAT-M3BP-250',
    serialNumber: 'UAT-MTR-0001',
    specification: { powerKw: 110, voltageV: 415, frequencyHz: 50, speedRpm: 1485 },
  },
  {
    id: 'uat_cmp_part_motor_bearing',
    code: 'UAT-CMP-P03',
    name: 'Motor Drive-End Bearing',
    type: 'part',
    parentId: 'uat_cmp_component_motor',
    criticality: 'high',
    manufacturer: 'SKF',
    modelNumber: 'UAT-6314-C3',
    serialNumber: 'UAT-BRG-6314-0001',
    specification: { bearingType: 'deep groove ball bearing', boreMm: 70 },
  },
];

async function main() {
  const plant = await db.plant.findUnique({ where: { code: PLANT_CODE } });
  if (!plant) {
    throw new Error(`Machine commissioning requires plant ${PLANT_CODE}`);
  }

  const existingAssets = await db.asset.count();
  if (existingAssets > 0) {
    console.log(`ℹ️ Machine commissioning skipped: ${existingAssets} asset(s) already exist`);
    return;
  }

  const admin = await db.user.findUnique({ where: { username: 'admin' }, select: { id: true } });
  if (!admin) throw new Error('Machine commissioning requires demo admin user');

  const maintenance = await db.department.findFirst({
    where: { plantId: plant.id, code: 'MAINT' },
    select: { id: true },
  });
  if (!maintenance) throw new Error('Machine commissioning requires MAINT department');

  const category = await db.assetCategory.upsert({
    where: { code: 'ROTATING' },
    update: {
      name: 'Rotating Equipment',
      description: 'Industrial rotating equipment including compressors, pumps, motors and gearboxes',
      isActive: true,
    },
    create: {
      name: 'Rotating Equipment',
      code: 'ROTATING',
      description: 'Industrial rotating equipment including compressors, pumps, motors and gearboxes',
    },
  });

  const asset = await db.asset.create({
    data: {
      name: 'Plant Air Compressor 01',
      assetTag: ASSET_TAG,
      description: 'Clean-UAT industrial rotary screw compressor used to validate deep asset hierarchy, PM, inventory, work-order and installed-spare workflows.',
      categoryId: category.id,
      serialNumber: 'UAT-COMP-SN-0001',
      manufacturer: 'Atlas Copco',
      model: 'UAT-GA110',
      yearManufactured: 2024,
      condition: 'good',
      status: 'operational',
      criticality: 'critical',
      location: 'Compressor House',
      building: 'Utilities Block',
      area: 'Compressed Air Station',
      plantId: plant.id,
      departmentId: maintenance.id,
      installedDate: new Date('2026-01-15T00:00:00.000Z'),
      expectedLifeYears: 15,
      specification: JSON.stringify({
        type: 'oil-injected rotary screw compressor',
        ratedPowerKw: 110,
        nominalPressureBar: 8,
        freeAirDeliveryM3Min: 19.8,
        supplyVoltageV: 415,
        frequencyHz: 50,
      }),
      createdById: admin.id,
    },
  });

  for (const entry of components) {
    await db.componentRegistry.create({
      data: {
        id: entry.id,
        componentCode: entry.code,
        name: entry.name,
        componentType: entry.type,
        parentId: entry.parentId ?? null,
        assetId: asset.id,
        criticality: entry.criticality,
        lifecycleStatus: 'operational',
        healthScore: 100,
        operatingHours: 0,
        manufacturer: entry.manufacturer ?? null,
        modelNumber: entry.modelNumber ?? null,
        serialNumber: entry.serialNumber ?? null,
        installedDate: new Date('2026-01-15T00:00:00.000Z'),
        specification: entry.specification ? JSON.stringify(entry.specification) : null,
      },
    });
  }

  const counts = {
    assets: await db.asset.count(),
    assetCategories: await db.assetCategory.count(),
    components: await db.componentRegistry.count({ where: { assetId: asset.id } }),
    assemblies: await db.componentRegistry.count({ where: { assetId: asset.id, componentType: 'assembly' } }),
    subassemblies: await db.componentRegistry.count({ where: { assetId: asset.id, componentType: 'subassembly' } }),
    componentNodes: await db.componentRegistry.count({ where: { assetId: asset.id, componentType: 'component' } }),
    parts: await db.componentRegistry.count({ where: { assetId: asset.id, componentType: 'part' } }),
    inventoryItems: await db.inventoryItem.count(),
    tools: await db.tool.count(),
    workOrders: await db.workOrder.count(),
    pmSchedules: await db.pmSchedule.count(),
  };

  console.log('✅ Clean UAT machine hierarchy commissioned');
  console.log(JSON.stringify(counts, null, 2));
}

main()
  .catch((error) => {
    console.error('❌ UAT machine hierarchy commissioning failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
