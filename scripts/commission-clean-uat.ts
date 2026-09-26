import { db } from '../src/lib/db';

const PLANT_CODE = 'TEMA-UAT-01';

const departments = [
  { code: 'MAINT', name: 'Maintenance', supervisor: 'maint_mgr1' },
  { code: 'PROD', name: 'Production', supervisor: 'prod_mgr1' },
  { code: 'ENG', name: 'Engineering', supervisor: 'iot1' },
  { code: 'WHL', name: 'Warehouse & Logistics', supervisor: 'inv_mgr1' },
  { code: 'QC', name: 'Quality Control', supervisor: 'qual_mgr1' },
  { code: 'HSE', name: 'Health Safety & Environment', supervisor: 'safety1' },
  { code: 'UTIL', name: 'Utilities', supervisor: null },
  { code: 'HR', name: 'Human Resources', supervisor: 'hr1' },
] as const;

async function main() {
  const userCount = await db.user.count();
  const plantCount = await db.plant.count();

  if (userCount === 0) {
    throw new Error('Clean-UAT commissioning requires existing users');
  }

  if (plantCount > 0) {
    console.log(`ℹ️ Commissioning skipped: ${plantCount} plant(s) already exist`);
    return;
  }

  const plant = await db.plant.create({
    data: {
      name: 'Tema Industrial UAT Plant',
      code: PLANT_CODE,
      location: 'Tema Industrial Area',
      country: 'Ghana',
      city: 'Tema',
      isActive: true,
    },
  });

  for (const entry of departments) {
    const supervisor = entry.supervisor
      ? await db.user.findUnique({ where: { username: entry.supervisor }, select: { id: true } })
      : null;

    await db.department.create({
      data: {
        name: entry.name,
        code: entry.code,
        plantId: plant.id,
        supervisorId: supervisor?.id ?? null,
      },
    });
  }

  const users = await db.user.findMany({
    select: {
      id: true,
      userRoles: {
        select: {
          role: { select: { slug: true } },
        },
      },
    },
  });

  for (const user of users) {
    const isAdmin = user.userRoles.some((binding) => binding.role.slug === 'admin');

    await db.userPlant.upsert({
      where: {
        userId_plantId: {
          userId: user.id,
          plantId: plant.id,
        },
      },
      update: {
        accessLevel: isAdmin ? 'admin' : 'write',
        isPrimary: true,
      },
      create: {
        userId: user.id,
        plantId: plant.id,
        accessLevel: isAdmin ? 'admin' : 'write',
        isPrimary: true,
      },
    });

    await db.userPlant.updateMany({
      where: {
        userId: user.id,
        plantId: { not: plant.id },
      },
      data: { isPrimary: false },
    });
  }

  const counts = {
    users: await db.user.count(),
    plants: await db.plant.count(),
    departments: await db.department.count({ where: { plantId: plant.id } }),
    plantAssignments: await db.userPlant.count({ where: { plantId: plant.id } }),
    primaryAssignments: await db.userPlant.count({ where: { plantId: plant.id, isPrimary: true } }),
    assets: await db.asset.count(),
    inventoryItems: await db.inventoryItem.count(),
    tools: await db.tool.count(),
    workOrders: await db.workOrder.count(),
    maintenanceRequests: await db.maintenanceRequest.count(),
    pmSchedules: await db.pmSchedule.count(),
    installedSpareParts: await db.installedSparePart.count(),
  };

  console.log('✅ Clean UAT plant commissioned');
  console.log(JSON.stringify(counts, null, 2));
}

main()
  .catch((error) => {
    console.error('❌ Clean UAT commissioning failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
