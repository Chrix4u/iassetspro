import { PrismaClient } from '@prisma/client';
if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) throw new Error('DATABASE_URL must point to PostgreSQL');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db = new PrismaClient({ adapter: createAdapter(process.env.DATABASE_URL) });

const TAG = 'UAT-GTP-312-1-027';
const PREFIX = 'GTP-SING';
const DRY_RUN = process.env.DRY_RUN === '1';
const EXCLUDE = /silicate machine|nova jet 3000|engraving/i;

const RULES = [
  { key: 'sewing', code: 'CMP-SEW', re: /sewing machine|sawing machine|pegasus|pegases/i },
  { key: 'needle', code: 'PRT-NEEDLE', re: /needle/i },
  { key: 'sew-cable', code: 'PRT-SEW-CABLE', re: /sewing machine cable/i },
  { key: 'sew-socket', code: 'PRT-SEW-SOCKET', re: /sewing machine socket/i },
  { key: 'sew-blade', code: 'PRT-SEW-BLADE', re: /sewing machine blade/i },
  { key: 'piler', code: 'CMP-PILER', re: /piler|piller|piler unit|main piler|main piller/i },
  { key: 'piler-chain', code: 'PRT-PILER-CHAIN', re: /piling chain|piler chain/i },
  { key: 'piler-belt', code: 'PRT-PILER-BELT', re: /piler motor belt/i },
  { key: 'piler-gear', code: 'PRT-PILER-GEAR', re: /piler gear|piller gear/i },
  { key: 'plaiter', code: 'CMP-PLAIT', re: /plaiter|j-box/i },
  { key: 'burner', code: 'CMP-BURNER', re: /burner|burnner/i },
  { key: 'gas', code: 'SUB-GAS', re: /gas.*flow|gas supply|reduction valve/i },
  { key: 'mangle', code: 'CMP-MANGLE', re: /\bmangle\b/i },
  { key: 'saturator', code: 'CMP-SAT', re: /saturator/i },
  { key: 'washer', code: 'CMP-WASH', re: /1st washer|first washer|washing unit/i },
  { key: 'spray', code: 'CMP-SPRAY', re: /spray unit|splickling water|sprinkling water/i },
  { key: 'desize', code: 'CMP-DESIZE', re: /desizing tank|desilting tank/i },
  { key: 'water', code: 'PRT-WATER-LINE', re: /water coupling|water leakage|water line|water hose|water pipe/i },
  { key: 'air', code: 'SUB-AIR', re: /air leakage/i },
  { key: 'steam', code: 'SUB-STEAM', re: /steam supply|steam line/i },
  { key: 'guider', code: 'CMP-GUIDER', re: /cloth guider|foxwell guider|foxwell quider/i },
  { key: 'pin', code: 'CMP-PIN', re: /pin rollers?/i },
  { key: 'brush', code: 'CMP-BRUSH', re: /brush mechanism/i },
  { key: 'roller', code: 'CMP-ROLLER', re: /bummer roller|rollers? on the singeing|faulty bearing on the singeing/i },
  { key: 'lifter', code: 'CMP-LIFTER', re: /\blifter\b|pallet lifter/i },
  { key: 'poteye', code: 'CMP-POTEYE', re: /pot[- ]?eye|port eye/i },
  { key: 'hydrant', code: 'CMP-HYDRANT', re: /fire hydrant|fire extinguisher.*water|emergency fire extinguisher/i },
  { key: 'fire-hose', code: 'PRT-FIRE-HOSE', re: /fire.*hose/i },
  { key: 'estop', code: 'CMP-ESTOP', re: /emergency stop/i },
  { key: 'yard', code: 'INS-YARD', re: /yardage counter/i },
  { key: 'level', code: 'INS-LEVEL', re: /level sensor/i },
  { key: 'electrical', code: 'CMP-ELEC', re: /electrical fault/i },
  { key: 'drive', code: 'CMP-DRIVE', re: /unable to move|machine unable to move/i },
  { key: 'wheels', code: 'CMP-WHEELS', re: /lubricate wheels/i },
] as const;

const MARKER = 'Auto-mapped from GTP Singeing Machine historical work-order title by conservative UAT commissioning rule; verify against OEM/master-data before production approval.';
function full(code: string) { return `${PREFIX}-${code}`; }

async function main() {
  const asset = await db.asset.findUnique({
    where: { assetTag: TAG },
    select: { id: true, assetTag: true, name: true },
  });
  if (!asset) throw new Error('Singeing missing');

  const workOrders = await db.workOrder.findMany({
    where: { assetId: asset.id },
    select: { id: true, woNumber: true, title: true },
    orderBy: { createdAt: 'asc' },
  });

  const evaluated = workOrders.map((workOrder) => {
    const title = workOrder.title || '';
    const excluded = EXCLUDE.test(title);
    return {
      workOrder,
      excluded,
      rules: excluded ? [] : RULES.filter((rule) => rule.re.test(title)),
    };
  });
  const matched = evaluated.filter((entry) => entry.rules.length > 0);
  const unmatched = evaluated.filter((entry) => entry.rules.length === 0);
  const excluded = evaluated.filter((entry) => entry.excluded);

  const ruleLinks: Record<string, number> = {};
  let linkCount = 0;
  for (const entry of matched) {
    for (const rule of entry.rules) {
      linkCount += 1;
      ruleLinks[rule.key] = (ruleLinks[rule.key] || 0) + 1;
    }
  }

  if (!DRY_RUN) {
    const components = await db.componentRegistry.findMany({
      where: { assetId: asset.id, componentCode: { in: RULES.map((rule) => full(rule.code)) } },
      select: { id: true, componentCode: true },
    });
    const componentMap = new Map(components.map((component) => [component.componentCode, component.id]));
    for (const rule of RULES) {
      if (!componentMap.has(full(rule.code))) throw new Error(`Missing ${full(rule.code)}`);
    }

    await db.$transaction(async (tx) => {
      for (const entry of matched) {
        const title = entry.workOrder.title || '';
        for (const rule of entry.rules) {
          const componentRegistryId = componentMap.get(full(rule.code))!;
          await tx.workOrderComponent.upsert({
            where: {
              workOrderId_componentRegistryId: {
                workOrderId: entry.workOrder.id,
                componentRegistryId,
              },
            },
            update: { notes: `${MARKER} Rule=${rule.key}; source title: ${title}` },
            create: {
              workOrderId: entry.workOrder.id,
              componentRegistryId,
              notes: `${MARKER} Rule=${rule.key}; source title: ${title}`,
            },
          });
        }
      }
    });
  }

  console.log(JSON.stringify({
    asset,
    dryRun: DRY_RUN,
    totalWorkOrders: workOrders.length,
    excludedWorkOrders: excluded.length,
    matchedWorkOrders: matched.length,
    coveragePct: Number((matched.length / Math.max(workOrders.length, 1) * 100).toFixed(1)),
    linkCount,
    ruleLinks,
    excluded: excluded.map(({ workOrder }) => ({ woNumber: workOrder.woNumber, title: workOrder.title })),
    unmatched: unmatched.filter((entry) => !entry.excluded).map(({ workOrder }) => ({
      woNumber: workOrder.woNumber,
      title: workOrder.title,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(async () => db.$disconnect());
