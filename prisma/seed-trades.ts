import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) {
  throw new Error('Trade seed requires a PostgreSQL DATABASE_URL');
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const prisma = new PrismaClient({ adapter: createAdapter(process.env.DATABASE_URL) });

async function seedTrades() {
  console.log('🌱 Seeding trades...');

  const trades = [
    {
      name: 'Mechanical',
      code: 'MECH',
      category: 'mechanical',
      description: 'Mechanical maintenance, repair, and installation of rotating and static equipment',
      color: '#ef4444',
    },
    {
      name: 'Electrical',
      code: 'ELEC',
      category: 'electrical',
      description: 'Electrical systems, power distribution, motor control, and wiring',
      color: '#f59e0b',
    },
    {
      name: 'Instrumentation & Control',
      code: 'INST',
      category: 'instrumentation',
      description: 'Process instrumentation, control systems, PLC, and SCADA maintenance',
      color: '#3b82f6',
    },
    {
      name: 'Civil & Structural',
      code: 'CIVIL',
      category: 'civil',
      description: 'Civil works, structural maintenance, concrete, and building systems',
      color: '#8b5cf6',
    },
    {
      name: 'HVAC',
      code: 'HVAC',
      category: 'hvac',
      description: 'Heating, ventilation, air conditioning, and refrigeration systems',
      color: '#06b6d4',
    },
    {
      name: 'Plumbing',
      code: 'PLMB',
      category: 'plumbing',
      description: 'Plumbing systems, water supply, drainage, and fire suppression',
      color: '#10b981',
    },
    {
      name: 'Welding & Fabrication',
      code: 'WELD',
      category: 'welding',
      description: 'Welding, cutting, fabrication, and metalwork',
      color: '#f97316',
    },
    {
      name: 'Painting & Coating',
      code: 'PAINT',
      category: 'painting',
      description: 'Industrial painting, protective coating, and surface treatment',
      color: '#ec4899',
    },
  ];

  for (const trade of trades) {
    const existing = await prisma.trade.findUnique({ where: { code: trade.code } });
    if (!existing) {
      await prisma.trade.create({ data: trade });
      console.log(`  ✅ Created trade: ${trade.name} (${trade.code})`);
    } else {
      console.log(`  ⏭️  Trade already exists: ${trade.name} (${trade.code})`);
    }
  }

  console.log('✨ Trade seeding complete!');
}

seedTrades()
  .catch((e) => {
    console.error('❌ Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
