/**
 * seed-repairs-uat.ts — Idempotent UAT test data for Repairs/RWOP Playwright suite
 */

import { PrismaClient } from '@prisma/client';
import { hash } from 'bcryptjs';
import {
  DEFAULT_WO_TRANSITIONS,
  DEFAULT_MR_TRANSITIONS,
} from '../src/lib/state-machine';

if (!process.env.DATABASE_URL || !process.env.DATABASE_URL.includes('mysql://')) {
  const host = process.env.DB_HOST || 'localhost';
  const port = process.env.DB_PORT || '3306';
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASSWORD || '';
  const database = process.env.DB_NAME || 'ifleetpro_eam_system';
  process.env.DATABASE_URL = `mysql://${user}:${password}@${host}:${port}/${database}`;
}

let db: PrismaClient;
try {
  const url = new URL(process.env.DATABASE_URL!);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createAdapter } = require('../src/lib/create-mariadb-adapter');
  const adapter = createAdapter({
    host: url.hostname,
    port: parseInt(url.port || '3306', 10),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
  });
  db = new PrismaClient({ adapter });
} catch {
  db = new PrismaClient();
}

const PASSWORD = 'TestPass123!';

interface UatUserDef {
  username: string;
  fullName: string;
  email: string;
  roleSlugs: string[];
  plantCodes: string[];
  isPrimaryPlant: string;
  primaryTrade?: string;
}

type TransitionSeed = {
  fromStatus: string | null;
  toStatus: string;
  allowedRoleSlugs: string;
  requiresReason: boolean;
};

/**
 * Prisma compound unique inputs do not accept null members even though
 * StatusTransition.fromStatus is intentionally nullable (null = initial state).
 * Preserve NULL semantics by using findFirst + update/create for initial
 * transitions and the compound-key upsert for normal transitions.
 */
async function upsertStatusTransition(
  entityType: 'work_order' | 'maintenance_request',
  transition: TransitionSeed,
  sortOrder: number,
) {
  const update = {
    allowedRoleSlugs: transition.allowedRoleSlugs,
    requiresReason: transition.requiresReason,
    sortOrder,
  };

  if (transition.fromStatus === null) {
    const existing = await db.statusTransition.findFirst({
      where: { entityType, fromStatus: null, toStatus: transition.toStatus },
      select: { id: true },
    });

    if (existing) {
      await db.statusTransition.update({ where: { id: existing.id }, data: update });
    } else {
      await db.statusTransition.create({
        data: { entityType, fromStatus: null, toStatus: transition.toStatus, ...update },
      });
    }
    return;
  }

  await db.statusTransition.upsert({
    where: {
      entityType_fromStatus_toStatus: {
        entityType,
        fromStatus: transition.fromStatus,
        toStatus: transition.toStatus,
      },
    },
    update,
    create: {
      entityType,
      fromStatus: transition.fromStatus,
      toStatus: transition.toStatus,
      ...update,
    },
  });
}

/**
 * UAT aliases are retained where existing test/state-machine code expects them,
 * but each operational user also carries the canonical production role that owns
 * the real RBAC permission bundle. This avoids test-only permission bypasses.
 */
const UAT_USERS: UatUserDef[] = [
  { username: 'uat_requester', fullName: 'UAT Requester', email: 'uat_requester@test.com', roleSlugs: ['requester', 'production_operator'], plantCodes: ['PLANT-A', 'PLANT-B'], isPrimaryPlant: 'PLANT-A' },
  { username: 'uat_supervisor', fullName: 'UAT Supervisor', email: 'uat_supervisor@test.com', roleSlugs: ['maintenance_supervisor'], plantCodes: ['PLANT-A', 'PLANT-B'], isPrimaryPlant: 'PLANT-A' },
  { username: 'uat_planner', fullName: 'UAT Planner', email: 'uat_planner@test.com', roleSlugs: ['planner', 'maintenance_planner'], plantCodes: ['PLANT-A', 'PLANT-B'], isPrimaryPlant: 'PLANT-A' },
  { username: 'uat_tech_single', fullName: 'UAT Tech Single', email: 'uat_tech_single@test.com', roleSlugs: ['maintenance_technician'], plantCodes: ['PLANT-A', 'PLANT-B'], isPrimaryPlant: 'PLANT-A', primaryTrade: 'Mechanical' },
  { username: 'uat_tech_leader', fullName: 'UAT Tech Leader', email: 'uat_tech_leader@test.com', roleSlugs: ['team_leader', 'maintenance_technician'], plantCodes: ['PLANT-A', 'PLANT-B'], isPrimaryPlant: 'PLANT-A', primaryTrade: 'Mechanical' },
  { username: 'uat_tech_assistant', fullName: 'UAT Tech Assistant', email: 'uat_tech_assistant@test.com', roleSlugs: ['maintenance_technician'], plantCodes: ['PLANT-A', 'PLANT-B'], isPrimaryPlant: 'PLANT-A', primaryTrade: 'Electrical' },
  { username: 'uat_storekeeper', fullName: 'UAT Storekeeper', email: 'uat_storekeeper@test.com', roleSlugs: ['storekeeper', 'store_keeper'], plantCodes: ['PLANT-A', 'PLANT-B'], isPrimaryPlant: 'PLANT-A' },
  { username: 'uat_plant_a_user', fullName: 'UAT Plant A User', email: 'uat_plant_a_user@test.com', roleSlugs: ['maintenance_technician'], plantCodes: ['PLANT-A'], isPrimaryPlant: 'PLANT-A', primaryTrade: 'Mechanical' },
  { username: 'uat_plant_b_user', fullName: 'UAT Plant B User', email: 'uat_plant_b_user@test.com', roleSlugs: ['maintenance_technician'], plantCodes: ['PLANT-B'], isPrimaryPlant: 'PLANT-B', primaryTrade: 'Mechanical' },
  { username: 'uat_supervisor_plant_a', fullName: 'UAT Supervisor Plant A Only', email: 'uat_supervisor_plant_a@test.com', roleSlugs: ['maintenance_supervisor'], plantCodes: ['PLANT-A'], isPrimaryPlant: 'PLANT-A' },
  { username: 'uat_planner_plant_a', fullName: 'UAT Planner Plant A Only', email: 'uat_planner_plant_a@test.com', roleSlugs: ['planner', 'maintenance_planner'], plantCodes: ['PLANT-A'], isPrimaryPlant: 'PLANT-A' },
  { username: 'uat_supervisor_plant_b', fullName: 'UAT Supervisor Plant B Only', email: 'uat_supervisor_plant_b@test.com', roleSlugs: ['maintenance_supervisor'], plantCodes: ['PLANT-B'], isPrimaryPlant: 'PLANT-B' },
  { username: 'uat_planner_plant_b', fullName: 'UAT Planner Plant B Only', email: 'uat_planner_plant_b@test.com', roleSlugs: ['planner', 'maintenance_planner'], plantCodes: ['PLANT-B'], isPrimaryPlant: 'PLANT-B' },
];

async function ensureUatModule(input: {
  code: string;
  name: string;
  isCore?: boolean;
}) {
  const now = new Date();
  const validUntil = new Date('2027-12-31T23:59:59.000Z');

  const systemModule = await db.systemModule.upsert({
    where: { code: input.code },
    update: {
      name: input.name,
      isCore: input.isCore ?? false,
      isSystemLicensed: true,
      validFrom: new Date('2024-01-01T00:00:00.000Z'),
      validUntil,
    },
    create: {
      code: input.code,
      name: input.name,
      description: `UAT module fixture for ${input.name}`,
      version: '2.0.0',
      isCore: input.isCore ?? false,
      isSystemLicensed: true,
      validFrom: new Date('2024-01-01T00:00:00.000Z'),
      validUntil,
    },
  });

  const existing = await db.companyModule.findFirst({
    where: {
      systemModuleId: systemModule.id,
      OR: [{ companyId: '__default__' }, { companyId: null }],
    },
    orderBy: [{ companyId: 'desc' }],
  });

  const data = {
    isActive: true,
    isEnabled: true,
    licensedAt: now,
    activatedAt: now,
  };

  if (existing) {
    await db.companyModule.update({ where: { id: existing.id }, data });
  } else {
    await db.companyModule.create({
      data: {
        systemModuleId: systemModule.id,
        companyId: '__default__',
        ...data,
      },
    });
  }
}

async function main() {
  console.log('🌱 Starting Repairs UAT seed script...');
  const passwordHash = await hash(PASSWORD, 12);

  for (const moduleDef of [
    { code: 'core', name: 'Core Platform', isCore: true },
    { code: 'work_orders', name: 'Work Orders', isCore: true },
    { code: 'maintenance_requests', name: 'Maintenance Requests', isCore: true },
    { code: 'inventory', name: 'Inventory & Spare Parts', isCore: true },
    { code: 'repairs', name: 'Repairs Maintenance' },
    { code: 'reports', name: 'Reports & Dashboards' },
    { code: 'tools', name: 'Tool Management' },
    { code: 'modules', name: 'Module Management', isCore: true },
  ]) {
    await ensureUatModule(moduleDef);
  }

  const plantA = await db.plant.upsert({
    where: { code: 'PLANT-A' },
    update: {},
    create: { name: 'Plant A', code: 'PLANT-A', location: 'Building A', city: 'Accra', country: 'Ghana' },
  });
  const plantB = await db.plant.upsert({
    where: { code: 'PLANT-B' },
    update: {},
    create: { name: 'Plant B', code: 'PLANT-B', location: 'Building B', city: 'Tema', country: 'Ghana' },
  });
  const plants: Record<string, string> = { 'PLANT-A': plantA.id, 'PLANT-B': plantB.id };

  const tradeMech = await db.trade.upsert({
    where: { name: 'Mechanical' }, update: {},
    create: { name: 'Mechanical', code: 'MECH', category: 'mechanical', description: 'Mechanical maintenance trade' },
  });
  const tradeElec = await db.trade.upsert({
    where: { name: 'Electrical' }, update: {},
    create: { name: 'Electrical', code: 'ELEC', category: 'electrical', description: 'Electrical maintenance trade' },
  });
  const trades: Record<string, string> = { Mechanical: tradeMech.id, Electrical: tradeElec.id };

  const assetCategory = await db.assetCategory.upsert({
    where: { code: 'UAT-EQUIP' },
    update: {},
    create: { name: 'UAT Test Equipment', code: 'UAT-EQUIP', description: 'Test equipment for UAT' },
  });

  const userIds: Record<string, string> = {};
  for (const u of UAT_USERS) {
    const user = await db.user.upsert({
      where: { username: u.username },
      update: { fullName: u.fullName, email: u.email, passwordHash, status: 'active', primaryTrade: u.primaryTrade || null },
      create: { username: u.username, fullName: u.fullName, email: u.email, passwordHash, status: 'active', primaryTrade: u.primaryTrade || null },
    });
    userIds[u.username] = user.id;

    for (const slug of u.roleSlugs) {
      const role = await db.role.upsert({
        where: { slug },
        update: {},
        create: {
          name: slug.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
          slug,
          level: 10,
          isSystem: true,
        },
      });
      await db.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: {},
        create: { userId: user.id, roleId: role.id },
      });
    }

    for (const code of u.plantCodes) {
      const plantId = plants[code];
      if (!plantId) continue;
      await db.userPlant.upsert({
        where: { userId_plantId: { userId: user.id, plantId } },
        update: {},
        create: { userId: user.id, plantId, accessLevel: 'write', isPrimary: code === u.isPrimaryPlant },
      });
    }

    if (u.primaryTrade && trades[u.primaryTrade]) {
      await db.userSkill.upsert({
        where: { userId_tradeId: { userId: user.id, tradeId: trades[u.primaryTrade] } },
        update: {},
        create: {
          userId: user.id,
          tradeId: trades[u.primaryTrade],
          proficiencyLevel: 'advanced',
          certified: true,
          yearsExperience: 5,
        },
      });
    }
  }

  const asset = await db.asset.upsert({
    where: { assetTag: 'UAT-PUMP-001' },
    update: {},
    create: {
      name: 'UAT Test Pump',
      assetTag: 'UAT-PUMP-001',
      description: 'Centrifugal pump for UAT testing',
      categoryId: assetCategory.id,
      plantId: plantA.id,
      condition: 'fair',
      status: 'operational',
      criticality: 'high',
      location: 'Workshop Bay 1',
      building: 'Building A',
      specification: '{}',
      createdById: userIds['uat_planner'],
    },
  });

  const pumpBearingComponent = await db.componentRegistry.upsert({
    where: { componentCode: 'UAT-PUMP-BRG-DE' },
    update: {
      name: 'UAT Pump Drive-End Bearing',
      assetId: asset.id,
      componentType: 'component',
      criticality: 'high',
      lifecycleStatus: 'operational',
      healthScore: 95,
    },
    create: {
      componentCode: 'UAT-PUMP-BRG-DE',
      name: 'UAT Pump Drive-End Bearing',
      description: 'Drive-end bearing used for Repairs UAT condition measurements',
      assetId: asset.id,
      componentType: 'component',
      criticality: 'high',
      lifecycleStatus: 'operational',
      healthScore: 95,
      specification: '{}',
    },
  });

  const existingVibrationPoint = await db.componentInspectionPoint.findFirst({
    where: {
      componentId: pumpBearingComponent.id,
      parameterKey: 'vibration',
      inspectionType: 'measurement',
    },
    select: { id: true },
  });
  const vibrationPointData = {
    name: 'Bearing Vibration',
    description: 'Drive-end bearing vibration velocity',
    inspectionType: 'measurement',
    parameterKey: 'vibration',
    normalRange: JSON.stringify({ min: 0, max: 4.5, unit: 'mm/s' }),
    frequency: 'per_start',
    isActive: true,
    sortOrder: 10,
  };
  if (existingVibrationPoint) {
    await db.componentInspectionPoint.update({
      where: { id: existingVibrationPoint.id },
      data: vibrationPointData,
    });
  } else {
    await db.componentInspectionPoint.create({
      data: {
        componentId: pumpBearingComponent.id,
        ...vibrationPointData,
      },
    });
  }

  for (let i = 0; i < DEFAULT_WO_TRANSITIONS.length; i++) {
    await upsertStatusTransition('work_order', DEFAULT_WO_TRANSITIONS[i], i);
  }
  for (let i = 0; i < DEFAULT_MR_TRANSITIONS.length; i++) {
    await upsertStatusTransition('maintenance_request', DEFAULT_MR_TRANSITIONS[i], i);
  }

  const woA1 = await db.workOrder.upsert({
    where: { woNumber: 'WO-UAT-A1' },
    update: {},
    create: {
      woNumber: 'WO-UAT-A1',
      title: 'UAT Single-Tech Pump Repair',
      description: 'UAT test WO for single technician flow',
      type: 'corrective', priority: 'high', status: 'assigned',
      assetId: asset.id, assetName: asset.name, plantId: plantA.id,
      assignedTo: userIds['uat_tech_single'], assignedSupervisorId: userIds['uat_supervisor'],
      assignedBy: userIds['uat_planner'], plannerId: userIds['uat_planner'],
      tradeActivity: 'mechanical', estimatedHours: 4,
      failureDescription: 'Abnormal vibration detected',
      safetyNotes: 'LOTO required before opening casing',
      suggestedParts: JSON.stringify([{ itemName: 'Bearing 6205', quantity: 2, unit: 'each', status: 'suggested' }]),
      suggestedTools: JSON.stringify([{ toolName: 'Dial Indicator', quantity: 1, status: 'suggested' }]),
    },
  });

  const woA2 = await db.workOrder.upsert({
    where: { woNumber: 'WO-UAT-A2' },
    update: {},
    create: {
      woNumber: 'WO-UAT-A2',
      title: 'UAT Multi-Tech Motor Overhaul',
      description: 'UAT test WO for multi-technician flow',
      type: 'corrective', priority: 'medium', status: 'assigned',
      assetId: asset.id, assetName: asset.name, plantId: plantA.id,
      assignedTo: userIds['uat_tech_leader'], teamLeaderId: userIds['uat_tech_leader'],
      assignedSupervisorId: userIds['uat_supervisor'], assignedBy: userIds['uat_planner'], plannerId: userIds['uat_planner'],
      tradeActivity: 'mechanical', estimatedHours: 8,
      failureDescription: 'Motor running hot, high current draw',
      safetyNotes: 'Electrical isolation required',
    },
  });

  await db.workOrderComponent.upsert({
    where: {
      workOrderId_componentRegistryId: {
        workOrderId: woA1.id,
        componentRegistryId: pumpBearingComponent.id,
      },
    },
    update: { notes: 'UAT baseline condition-measurement component' },
    create: {
      workOrderId: woA1.id,
      componentRegistryId: pumpBearingComponent.id,
      notes: 'UAT baseline condition-measurement component',
    },
  });

  await db.workOrderTeamMember.upsert({
    where: { workOrderId_userId: { workOrderId: woA2.id, userId: userIds['uat_tech_assistant'] } },
    update: {},
    create: {
      workOrderId: woA2.id,
      userId: userIds['uat_tech_assistant'],
      role: 'assistant',
      accessLevel: 'read_only',
      addedById: userIds['uat_planner'],
    },
  });

  const now = new Date();
  const mrUat = await db.maintenanceRequest.upsert({
    where: { requestNumber: 'MR-UAT-001' },
    update: {},
    create: {
      requestNumber: 'MR-UAT-001',
      title: 'UAT Pump Vibration Complaint',
      description: 'Pump UAT-PUMP-001 has abnormal vibration at 3000 RPM. Needs inspection.',
      priority: 'high', category: 'mechanical', status: 'pending', workflowStatus: 'pending',
      machineDownStatus: false,
      assetId: asset.id, assetName: asset.name, plantId: plantA.id,
      requestedBy: userIds['uat_requester'], supervisorId: userIds['uat_supervisor'],
      plannedStart: new Date(now.getTime() + 24 * 60 * 60 * 1000), estimatedHours: 4,
    },
  });

  const techSingleId = userIds['uat_tech_single'];
  const existingRate = await db.laborRate.findFirst({
    where: {
      userId: techSingleId,
      plantId: plantA.id,
      tradeId: tradeMech.id,
      effectiveFrom: new Date('2024-01-01'),
    },
  });
  if (!existingRate) {
    await db.laborRate.create({
      data: {
        userId: techSingleId, plantId: plantA.id, tradeId: tradeMech.id,
        normalHourlyRate: 50.0, overtimeHourlyRate: 75.0,
        effectiveFrom: new Date('2024-01-01'), currency: 'GHS',
      },
    });
  }

  const storekeeperId = userIds['uat_storekeeper'];
  const materials = [
    { itemCode: 'UAT-BRG-6205', name: 'UAT Bearing 6205', quantity: 10, unit: 'each', category: 'spare_part', unitCost: 120 },
    { itemCode: 'UAT-SEAL-KIT', name: 'UAT Seal Kit', quantity: 5, unit: 'each', category: 'spare_part', unitCost: 80 },
    { itemCode: 'UAT-LUB-5W30', name: 'UAT Lubricant 5W-30', quantity: 20, unit: 'litre', category: 'consumable', unitCost: 35 },
  ];
  for (const m of materials) {
    await db.inventoryItem.upsert({
      where: { itemCode: m.itemCode },
      update: { currentStock: m.quantity, unitOfMeasure: m.unit, unitCost: m.unitCost, plantId: plantA.id },
      create: {
        itemCode: m.itemCode, name: m.name, category: m.category,
        unitOfMeasure: m.unit, currentStock: m.quantity, minStockLevel: 0,
        unitCost: m.unitCost, plantId: plantA.id, createdById: storekeeperId,
        specification: '{}', imageUrls: '[]',
      },
    });
  }

  const DAY = 24 * 60 * 60 * 1000;
  const toolsData = [
    { toolCode: 'UAT-CAL-VALID', name: 'UAT-CAL-VALID', category: 'Measurement', condition: 'good', status: 'available', calStatus: 'calibrated' as const, nextCalDue: new Date(Date.now() + 180 * DAY), calIntervalDays: 365 },
    { toolCode: 'UAT-CAL-EXPIRED', name: 'UAT-CAL-EXPIRED', category: 'Measurement', condition: 'good', status: 'available', calStatus: 'expired' as const, nextCalDue: new Date(Date.now() - 30 * DAY), calIntervalDays: 365 },
    { toolCode: 'UAT-CAL-FAILED', name: 'UAT-CAL-FAILED', category: 'Measurement', condition: 'fair', status: 'in_repair', calStatus: 'failed' as const, nextCalDue: null, calIntervalDays: 365 },
  ];
  for (const t of toolsData) {
    const tool = await db.tool.upsert({
      where: { toolCode: t.toolCode },
      update: { name: t.name, category: t.category, condition: t.condition, status: t.status, quantity: 1, plantId: plantA.id },
      create: {
        toolCode: t.toolCode, name: t.name,
        description: `UAT calibration test tool — ${t.calStatus}`,
        category: t.category, condition: t.condition, status: t.status,
        quantity: 1, location: 'Calibration Lab', plantId: plantA.id,
        createdById: storekeeperId,
      },
    });
    await db.toolCalibrationRequirement.upsert({
      where: { toolId: tool.id },
      update: {
        calibrationRequired: true,
        calibrationStatus: t.calStatus,
        nextCalibrationDue: t.nextCalDue,
        calibrationIntervalDays: t.calIntervalDays,
      },
      create: {
        toolId: tool.id,
        calibrationRequired: true,
        calibrationStatus: t.calStatus,
        nextCalibrationDue: t.nextCalDue,
        calibrationIntervalDays: t.calIntervalDays,
      },
    });
  }

  console.log('\n✅ Repairs UAT seed completed successfully!');
  console.log(`   Plants: ${plantA.name}, ${plantB.name}`);
  console.log(`   Users: ${Object.keys(userIds).length}`);
  console.log(`   Asset: ${asset.assetTag}`);
  console.log(`   Component: ${pumpBearingComponent.componentCode}`);
  console.log(`   WOs: ${woA1.woNumber}, ${woA2.woNumber}`);
  console.log(`   MR: ${mrUat.requestNumber}`);
  console.log('   Labor Rate: GHS 50/hr normal, 75/hr OT');
  console.log('   UAT Bearing 6205 unit cost: GHS 120');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });