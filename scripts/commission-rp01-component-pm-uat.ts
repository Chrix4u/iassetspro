import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) {
  throw new Error('DATABASE_URL must point to PostgreSQL');
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db = new PrismaClient({ adapter: createAdapter(process.env.DATABASE_URL) });

const DEFINITIONS = [
  ['RP01-CMP-MOTOR','RP-01 Main Motor 1000h Inspection','custom_hours',1000,1.5,'high'],
  ['RP01-PRT-MTRBRG-DE','RP-01 Motor DE Bearing 2000h PM','custom_hours',2000,1.0,'high'],
  ['RP01-CMP-GEARBOX','RP-01 Main Gearbox 500h Inspection','custom_hours',500,1.5,'critical'],
  ['RP01-PRT-GBXBRG-IN','RP-01 Gearbox Input Bearing 1500h PM','custom_hours',1500,1.0,'high'],
  ['RP01-PRT-GBXBRG-OUT','RP-01 Gearbox Output Bearing 1500h PM','custom_hours',1500,1.0,'high'],
  ['RP01-PRT-BRG-DS','RP-01 Drive-Side Bearing 500h PM','custom_hours',500,1.0,'critical'],
  ['RP01-CMP-INKPUMP','RP-01 Ink Pump Weekly Inspection','weekly',1,0.75,'medium'],
  ['RP01-PRT-PUMPSEAL','RP-01 Ink Pump Seal Monthly Inspection','monthly',1,0.75,'medium'],
  ['RP01-CMP-EXFAN','RP-01 Exhaust Fan Monthly PM','monthly',1,1.0,'high'],
  ['RP01-INS-DRYTEMP','RP-01 Dryer Temperature Probe Quarterly Calibration','quarterly',1,1.0,'high'],
  ['RP01-INS-LOADCELL','RP-01 Web Tension Load Cell Quarterly Calibration','quarterly',1,1.0,'high'],
  ['RP01-INS-GUARDSW','RP-01 Guard Safety Switch Weekly Functional Test','weekly',1,0.5,'critical'],
  ['RP01-CMP-VFD','RP-01 Main Drive VFD Monthly Inspection','monthly',1,1.0,'high'],
  ['RP01-CMP-PLC','RP-01 PLC Cabinet Quarterly Inspection','quarterly',1,1.5,'high'],
] as const;

async function main() {
  const asset = await db.asset.findUnique({ where: { assetTag: 'UAT-RP-001' } });
  if (!asset) throw new Error('UAT-RP-001 is missing');

  const planner = await db.user.findFirst({
    where: { OR: [{ username: 'uat_planner' }, { username: 'admin' }] },
    orderBy: { username: 'asc' },
  });
  if (!planner) throw new Error('No planner/admin user available for UAT commissioning');

  let created = 0;
  let updated = 0;
  for (const [code,title,frequencyType,frequencyValue,estimatedDuration,priority] of DEFINITIONS) {
    const component = await db.componentRegistry.findUnique({ where: { componentCode: code } });
    if (!component || component.assetId !== asset.id) throw new Error(`Missing RP-01 component: ${code}`);

    const existing = await db.pmSchedule.findFirst({ where: { assetId: asset.id, componentId: component.id, title } });
    const data = {
      description: `Component-level UAT PM for ${component.name} (${code}). Verify task execution, history, due state, tools/spares and drill-down context.`,
      frequencyType,
      frequencyValue,
      estimatedDuration,
      priority,
      isActive: true,
      autoGenerateWO: true,
      leadDays: priority === 'critical' ? 2 : 3,
      nextDueDate: new Date(Date.now() + 7 * 86_400_000),
    };
    if (existing) {
      await db.pmSchedule.update({ where: { id: existing.id }, data });
      updated++;
    } else {
      await db.pmSchedule.create({
        data: { ...data, title, assetId: asset.id, componentId: component.id, createdById: planner.id },
      });
      created++;
    }
  }

  const total = await db.pmSchedule.count({ where: { assetId: asset.id, componentId: { not: null }, isActive: true } });
  console.log(JSON.stringify({ assetTag: asset.assetTag, created, updated, activeComponentPmSchedules: total }, null, 2));
}

main().finally(() => db.$disconnect());