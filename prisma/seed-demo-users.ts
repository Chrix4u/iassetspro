import { hash } from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');

const databaseUrl = process.env.DATABASE_URL || '';
if (!/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
  throw new Error('seed:demo-users requires a PostgreSQL DATABASE_URL');
}

const adminPassword = process.env.DEMO_ADMIN_PASSWORD || '';
const demoPassword = process.env.DEMO_USER_PASSWORD || '';

function validateSeedPassword(name: string, value: string) {
  const errors: string[] = [];
  if (value.length < 12) errors.push('at least 12 characters');
  if (!/[A-Z]/.test(value)) errors.push('an uppercase letter');
  if (!/[a-z]/.test(value)) errors.push('a lowercase letter');
  if (!/[0-9]/.test(value)) errors.push('a number');
  if (!/[^A-Za-z0-9]/.test(value)) errors.push('a special character');
  if (errors.length) {
    throw new Error(`${name} must contain ${errors.join(', ')}`);
  }
}

validateSeedPassword('DEMO_ADMIN_PASSWORD', adminPassword);
validateSeedPassword('DEMO_USER_PASSWORD', demoPassword);

const db = new PrismaClient({
  adapter: createAdapter(databaseUrl),
  log: ['warn', 'error'],
});

type DemoUser = {
  username: string;
  email: string;
  fullName: string;
  staffId: string;
  roleSlug: string;
  department: string;
  primaryTrade?: string;
  passwordKind: 'admin' | 'demo';
};

// Plant access is intentionally not seeded: commissioning creates real test
// plants first, then UAT users can be assigned without reintroducing demo plant data.
const demoUsers: DemoUser[] = [
  { username: 'admin', email: 'admin@iassetspro.com', fullName: 'System Administrator', staffId: 'EMP-001', roleSlug: 'admin', department: 'Maintenance', passwordKind: 'admin' },
  { username: 'pm.temafactory', email: 'pm.temafactory@iassetspro.com', fullName: 'Kwame Asante', staffId: 'EMP-002', roleSlug: 'admin', department: 'Maintenance', primaryTrade: 'Maintenance Management', passwordKind: 'admin' },
  { username: 'planner1', email: 'planner@iassetspro.com', fullName: 'Kwame Planner', staffId: 'PLN-001', roleSlug: 'maintenance_planner', department: 'Maintenance', passwordKind: 'demo' },
  { username: 'supervisor1', email: 'supervisor@iassetspro.com', fullName: 'Ama Supervisor', staffId: 'SUP-001', roleSlug: 'maintenance_supervisor', department: 'Production', passwordKind: 'demo' },
  { username: 'tech1', email: 'tech@iassetspro.com', fullName: 'Kofi Technician', staffId: 'TEC-001', roleSlug: 'maintenance_technician', department: 'Maintenance', passwordKind: 'demo' },
  { username: 'operator1', email: 'operator@iassetspro.com', fullName: 'Akua Operator', staffId: 'OPR-001', roleSlug: 'production_operator', department: 'Production', passwordKind: 'demo' },
  { username: 'manager1', email: 'manager1@iassetspro.com', fullName: 'Nana Plant Manager', staffId: 'PMG-001', roleSlug: 'plant_manager', department: 'Maintenance', passwordKind: 'demo' },
  { username: 'maint_mgr1', email: 'maint_mgr1@iassetspro.com', fullName: 'Efua Maint Manager', staffId: 'MMG-001', roleSlug: 'maintenance_manager', department: 'Maintenance', passwordKind: 'demo' },
  { username: 'tech2', email: 'tech2@iassetspro.com', fullName: 'Yaw Technician', staffId: 'TEC-002', roleSlug: 'maintenance_technician', department: 'Maintenance', passwordKind: 'demo' },
  { username: 'prod_mgr1', email: 'prod_mgr1@iassetspro.com', fullName: 'Adwoa Prod Manager', staffId: 'PRM-001', roleSlug: 'production_manager', department: 'Production', passwordKind: 'demo' },
  { username: 'op2', email: 'op2@iassetspro.com', fullName: 'Kwabena Operator', staffId: 'OPR-002', roleSlug: 'production_operator', department: 'Production', passwordKind: 'demo' },
  { username: 'inv_mgr1', email: 'inv_mgr1@iassetspro.com', fullName: 'Abena Inv Manager', staffId: 'IVM-001', roleSlug: 'inventory_manager', department: 'Warehouse & Logistics', passwordKind: 'demo' },
  { username: 'store1', email: 'store1@iassetspro.com', fullName: 'Kwaku Store Keeper', staffId: 'STK-001', roleSlug: 'store_keeper', department: 'Warehouse & Logistics', passwordKind: 'demo' },
  { username: 'qual_mgr1', email: 'qual_mgr1@iassetspro.com', fullName: 'Ama Quality Mgr', staffId: 'QAM-001', roleSlug: 'quality_manager', department: 'Quality Control', passwordKind: 'demo' },
  { username: 'safety1', email: 'safety1@iassetspro.com', fullName: 'Kojo Safety Officer', staffId: 'SAF-001', roleSlug: 'safety_officer', department: 'Health Safety & Environment', passwordKind: 'demo' },
  { username: 'hr1', email: 'hr1@iassetspro.com', fullName: 'Afia HR Manager', staffId: 'HRM-001', roleSlug: 'hr_manager', department: 'Engineering', passwordKind: 'demo' },
  { username: 'iot1', email: 'iot1@iassetspro.com', fullName: 'Emmanuel IoT Engineer', staffId: 'IOT-001', roleSlug: 'iot_engineer', department: 'Engineering', passwordKind: 'demo' },
  { username: 'viewer1', email: 'viewer1@iassetspro.com', fullName: 'Grace Viewer', staffId: 'VWR-001', roleSlug: 'viewer', department: 'Utilities', passwordKind: 'demo' },
  { username: 'toolshop1', email: 'toolshop1@iassetspro.com', fullName: 'Kofi Tools Shop', staffId: 'TLS-001', roleSlug: 'tools_shop_attendant', department: 'Maintenance', passwordKind: 'demo' },
  { username: 'store2', email: 'store2@iassetspro.com', fullName: 'Ama Store Attendant', staffId: 'STK-002', roleSlug: 'store_keeper', department: 'Warehouse & Logistics', passwordKind: 'demo' },
  { username: 'tech_eng1', email: 'tech_eng1@iassetspro.com', fullName: 'Kwame Engineering Tech', staffId: 'TEC-003', roleSlug: 'maintenance_technician', department: 'Engineering', passwordKind: 'demo' },
  { username: 'tech_prod1', email: 'tech_prod1@iassetspro.com', fullName: 'Esi Production Tech', staffId: 'TEC-004', roleSlug: 'maintenance_technician', department: 'Production', passwordKind: 'demo' },
  { username: 'tech_util1', email: 'tech_util1@iassetspro.com', fullName: 'Kojo Utilities Tech', staffId: 'TEC-005', roleSlug: 'maintenance_technician', department: 'Utilities', passwordKind: 'demo' },
];

async function main() {
  const roleRows = await db.role.findMany({
    where: { slug: { in: [...new Set(demoUsers.map((u) => u.roleSlug))] } },
    select: { id: true, slug: true },
  });
  const roleBySlug = new Map(roleRows.map((role) => [role.slug, role.id]));

  const missingRoles = [...new Set(demoUsers.map((u) => u.roleSlug))].filter((slug) => !roleBySlug.has(slug));
  if (missingRoles.length) {
    throw new Error(`Demo user seed requires missing roles: ${missingRoles.join(', ')}`);
  }

  const [adminHash, demoHash] = await Promise.all([
    hash(adminPassword, 12),
    hash(demoPassword, 12),
  ]);

  let created = 0;
  let updated = 0;

  for (const definition of demoUsers) {
    const existing = await db.user.findUnique({
      where: { username: definition.username },
      select: { id: true },
    });

    const commonData = {
      email: definition.email,
      fullName: definition.fullName,
      staffId: definition.staffId,
      department: definition.department,
      primaryTrade: definition.primaryTrade ?? null,
      status: 'active',
    };

    const user = existing
      ? await db.user.update({
          where: { id: existing.id },
          data: commonData,
        })
      : await db.user.create({
          data: {
            username: definition.username,
            passwordHash: definition.passwordKind === 'admin' ? adminHash : demoHash,
            ...commonData,
          },
        });

    if (existing) updated += 1;
    else created += 1;

    const roleId = roleBySlug.get(definition.roleSlug)!;

    // Demo identities are canonical for UAT. Keep their intended role exact,
    // while leaving plant access empty until real commissioning creates plants.
    await db.userRole.deleteMany({
      where: {
        userId: user.id,
        roleId: { not: roleId },
      },
    });
    await db.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId } },
      update: {},
      create: { userId: user.id, roleId },
    });
  }

  const total = await db.user.count({
    where: { username: { in: demoUsers.map((user) => user.username) } },
  });

  if (total !== demoUsers.length) {
    throw new Error(`Demo user seed invariant failed: expected ${demoUsers.length}, found ${total}`);
  }

  console.log(`✅ Demo identities ready: ${total} (${created} created, ${updated} updated)`);
  console.log('✅ Passwords were sourced from server environment and are not stored in source control');
  console.log('✅ No plants, assets, work orders, inventory, tools or other operational records were created');
}

main()
  .catch((error) => {
    console.error('❌ Demo user seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
