import { hash } from 'bcryptjs';
import { db } from '../src/lib/db';

const ADMIN_PASSWORD = 'admin123';
const DEMO_PASSWORD = 'password123';

type DemoUser = {
  username: string;
  email: string;
  fullName: string;
  staffId: string;
  roleSlug: string;
  department: string;
  primaryTrade?: string;
  adminPassword?: boolean;
};

const demoUsers: DemoUser[] = [
  { username: 'admin', email: 'admin@iassetspro.com', fullName: 'System Administrator', staffId: 'EMP-001', roleSlug: 'admin', department: 'Maintenance', adminPassword: true },
  { username: 'pm.temafactory', email: 'pm.temafactory@iassetspro.com', fullName: 'Kwame Asante', staffId: 'EMP-002', roleSlug: 'admin', department: 'Maintenance', primaryTrade: 'Maintenance Management', adminPassword: true },
  { username: 'planner1', email: 'planner@iassetspro.com', fullName: 'Kwame Planner', staffId: 'PLN-001', roleSlug: 'maintenance_planner', department: 'Maintenance', primaryTrade: 'Mechanical Engineer' },
  { username: 'supervisor1', email: 'supervisor@iassetspro.com', fullName: 'Ama Supervisor', staffId: 'SUP-001', roleSlug: 'maintenance_supervisor', department: 'Production', primaryTrade: 'Production Supervisor' },
  { username: 'tech1', email: 'tech@iassetspro.com', fullName: 'Kofi Technician', staffId: 'TEC-001', roleSlug: 'maintenance_technician', department: 'Maintenance', primaryTrade: 'Mechanical Fitter' },
  { username: 'operator1', email: 'operator@iassetspro.com', fullName: 'Akua Operator', staffId: 'OPR-001', roleSlug: 'production_operator', department: 'Production', primaryTrade: 'Machine Operator' },
  { username: 'manager1', email: 'manager1@iassetspro.com', fullName: 'Nana Plant Manager', staffId: 'PMG-001', roleSlug: 'plant_manager', department: 'Maintenance', primaryTrade: 'Operations Manager' },
  { username: 'maint_mgr1', email: 'maint_mgr1@iassetspro.com', fullName: 'Efua Maint Manager', staffId: 'MMG-001', roleSlug: 'maintenance_manager', department: 'Maintenance', primaryTrade: 'Mechanical Engineer' },
  { username: 'tech2', email: 'tech2@iassetspro.com', fullName: 'Yaw Technician', staffId: 'TEC-002', roleSlug: 'maintenance_technician', department: 'Maintenance', primaryTrade: 'Electrician' },
  { username: 'prod_mgr1', email: 'prod_mgr1@iassetspro.com', fullName: 'Adwoa Prod Manager', staffId: 'PRM-001', roleSlug: 'production_manager', department: 'Production', primaryTrade: 'Production Manager' },
  { username: 'op2', email: 'op2@iassetspro.com', fullName: 'Kwabena Operator', staffId: 'OPR-002', roleSlug: 'production_operator', department: 'Production', primaryTrade: 'Machine Operator' },
  { username: 'inv_mgr1', email: 'inv_mgr1@iassetspro.com', fullName: 'Abena Inv Manager', staffId: 'IVM-001', roleSlug: 'inventory_manager', department: 'Warehouse & Logistics', primaryTrade: 'Supply Chain' },
  { username: 'store1', email: 'store1@iassetspro.com', fullName: 'Kwaku Store Keeper', staffId: 'STK-001', roleSlug: 'store_keeper', department: 'Warehouse & Logistics', primaryTrade: 'Storekeeping' },
  { username: 'qual_mgr1', email: 'qual_mgr1@iassetspro.com', fullName: 'Ama Quality Mgr', staffId: 'QAM-001', roleSlug: 'quality_manager', department: 'Quality Control', primaryTrade: 'Quality Engineer' },
  { username: 'safety1', email: 'safety1@iassetspro.com', fullName: 'Kojo Safety Officer', staffId: 'SAF-001', roleSlug: 'safety_officer', department: 'Health Safety & Environment', primaryTrade: 'HSE Officer' },
  { username: 'hr1', email: 'hr1@iassetspro.com', fullName: 'Afia HR Manager', staffId: 'HRM-001', roleSlug: 'hr_manager', department: 'Engineering', primaryTrade: 'Human Resources' },
  { username: 'iot1', email: 'iot1@iassetspro.com', fullName: 'Emmanuel IoT Engineer', staffId: 'IOT-001', roleSlug: 'iot_engineer', department: 'Engineering', primaryTrade: 'Instrumentation Technician' },
  { username: 'viewer1', email: 'viewer1@iassetspro.com', fullName: 'Grace Viewer', staffId: 'VWR-001', roleSlug: 'viewer', department: 'Utilities', primaryTrade: 'Utility Technician' },
  { username: 'toolshop1', email: 'toolshop1@iassetspro.com', fullName: 'Kofi Tools Shop', staffId: 'TLS-001', roleSlug: 'tools_shop_attendant', department: 'Maintenance', primaryTrade: 'Workshop Technician' },
  { username: 'store2', email: 'store2@iassetspro.com', fullName: 'Ama Store Attendant', staffId: 'STK-002', roleSlug: 'store_keeper', department: 'Warehouse & Logistics', primaryTrade: 'Storekeeping' },
  { username: 'tech_eng1', email: 'tech_eng1@iassetspro.com', fullName: 'Kwame Engineering Tech', staffId: 'TEC-003', roleSlug: 'maintenance_technician', department: 'Engineering', primaryTrade: 'Instrumentation Fitter' },
  { username: 'tech_prod1', email: 'tech_prod1@iassetspro.com', fullName: 'Esi Production Tech', staffId: 'TEC-004', roleSlug: 'maintenance_technician', department: 'Production', primaryTrade: 'Mechanical Fitter' },
  { username: 'tech_util1', email: 'tech_util1@iassetspro.com', fullName: 'Kojo Utilities Tech', staffId: 'TEC-005', roleSlug: 'maintenance_technician', department: 'Utilities', primaryTrade: 'Electrical Technician' },
];

async function main() {
  const operationalCounts = {
    plants: await db.plant.count(),
    departments: await db.department.count(),
    assets: await db.asset.count(),
    workOrders: await db.workOrder.count(),
    maintenanceRequests: await db.maintenanceRequest.count(),
    inventoryItems: await db.inventoryItem.count(),
    tools: await db.tool.count(),
  };

  const nonZeroOperational = Object.entries(operationalCounts).filter(([, count]) => count > 0);
  if (nonZeroOperational.length > 0) {
    console.warn(
      'Demo-user seed is identity-only. Operational records already exist and will not be modified:',
      Object.fromEntries(nonZeroOperational),
    );
  }

  const [adminHash, demoHash] = await Promise.all([
    hash(ADMIN_PASSWORD, 10),
    hash(DEMO_PASSWORD, 10),
  ]);

  let roleBindings = 0;

  for (const entry of demoUsers) {
    const role = await db.role.findUnique({
      where: { slug: entry.roleSlug },
      select: { id: true, slug: true },
    });

    if (!role) {
      throw new Error(`Required role is missing: ${entry.roleSlug}`);
    }

    const user = await db.user.upsert({
      where: { username: entry.username },
      update: {
        email: entry.email,
        passwordHash: entry.adminPassword ? adminHash : demoHash,
        fullName: entry.fullName,
        staffId: entry.staffId,
        department: entry.department,
        primaryTrade: entry.primaryTrade ?? null,
        status: 'active',
      },
      create: {
        username: entry.username,
        email: entry.email,
        passwordHash: entry.adminPassword ? adminHash : demoHash,
        fullName: entry.fullName,
        staffId: entry.staffId,
        department: entry.department,
        primaryTrade: entry.primaryTrade ?? null,
        status: 'active',
      },
      select: { id: true, username: true },
    });

    await db.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
    roleBindings += 1;
  }

  const counts = {
    users: await db.user.count(),
    userRoles: await db.userRole.count(),
    userPlants: await db.userPlant.count(),
    plants: await db.plant.count(),
    assets: await db.asset.count(),
    workOrders: await db.workOrder.count(),
    inventoryItems: await db.inventoryItem.count(),
  };

  console.log('✅ Demo users seeded without plant or operational demo data');
  console.log(`✅ Canonical demo users: ${demoUsers.length}`);
  console.log(`✅ Role bindings ensured: ${roleBindings}`);
  console.log(counts);
}

main()
  .catch((error) => {
    console.error('Demo-user seed failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
