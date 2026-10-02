import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) {
  throw new Error('DATABASE_URL must point to PostgreSQL');
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db = new PrismaClient({ adapter: createAdapter(process.env.DATABASE_URL) });

const TARGET_ASSET_TAG = 'UAT-GTP-350-5-015';
const RSP5_TITLE = /\bR\.?S\.?P\.?\s*5\b|Rotary screen printing 5/i;

const RULES = [
  {
    key: 'printing',
    componentCode: 'GTP-RSP5-ASM-PRINT',
    pattern: /screen\s*(head|washer|washing|tensioner)|washer\s*screen|washing\s*unit|washingunit|squeege+|squeezer\s*(holder|bracket|balloon)|glue\s*wiper|screen[^.]{0,40}bearing|bearing[^.]{0,40}screen|printing\s*head|head\s*(no|number|#|\d)/i,
  },
  {
    key: 'ink-pump',
    componentCode: 'GTP-RSP5-CMP-INKPUMP',
    pattern: /colour\s+pumps?|color\s+pumps?|ink\s+pumps?|\bpumps?\s*[#0-9]|pump\s*(no|number|#|\d)|pumps?\s+for\s+printing/i,
  },
  {
    key: 'dryer',
    componentCode: 'GTP-RSP5-ASM-DRYER',
    pattern: /burners?|dryer|drying|heater/i,
  },
  {
    key: 'web-handling',
    componentCode: 'GTP-RSP5-ASM-WEB',
    pattern: /conveyor|converyor|belt|blanket|blamket|deviation|latis roller|lattice roller|roller way|duplex roller|pressure roller|diversion roller|sewing machine/i,
  },
  {
    key: 'drive',
    componentCode: 'GTP-RSP5-ASM-DRIVE',
    pattern: /\bdrives?\b|\bmotors?\b|gearbox|shaft/i,
  },
  {
    key: 'controls',
    componentCode: 'GTP-RSP5-ASM-CTRL',
    pattern: /sensors?|electrical|instrument|encoder|\bvfd\b|\bplc\b|lamp|touch\s*pad|monitor|display\s*screen|printing\s*monitor|control\s*switch|push\s*batton|push\s*button|bulbs?|lights?|panel/i,
  },
  {
    key: 'exhaust-fan',
    componentCode: 'GTP-RSP5-CMP-EXFAN',
    pattern: /\bfans?\b/i,
  },
  {
    key: 'pneumatics',
    componentCode: 'GTP-RSP5-ASM-PNEU',
    pattern: /pneumatic|clamps?|clumps?|air regulator|air line|air leakage|solenoid\s*valve/i,
  },
] as const;

const PROVENANCE =
  'Auto-mapped from GTP historical RSP5 work-order title by conservative UAT commissioning rule; verify during OEM/master-data review.';

async function main() {
  const asset = await db.asset.findUnique({
    where: { assetTag: TARGET_ASSET_TAG },
    select: { id: true, assetTag: true, name: true },
  });
  if (!asset) throw new Error(`${TARGET_ASSET_TAG} is missing`);

  const components = await db.componentRegistry.findMany({
    where: {
      assetId: asset.id,
      componentCode: { in: RULES.map((rule) => rule.componentCode) },
    },
    select: { id: true, componentCode: true, name: true },
  });
  const componentByCode = new Map(components.map((item) => [item.componentCode, item]));
  for (const rule of RULES) {
    if (!componentByCode.has(rule.componentCode)) {
      throw new Error(`Required component is missing: ${rule.componentCode}`);
    }
  }

  const workOrders = await db.workOrder.findMany({
    where: { assetId: asset.id },
    select: { id: true, woNumber: true, title: true },
  });

  let eligibleTitles = 0;
  let matchedWorkOrders = 0;
  let upsertedLinks = 0;
  const counts: Record<string, number> = {};

  await db.$transaction(async (tx) => {
    for (const workOrder of workOrders) {
      const title = workOrder.title || '';
      if (!RSP5_TITLE.test(title)) continue;
      eligibleTitles += 1;

      const matches = RULES.filter((rule) => rule.pattern.test(title));
      if (matches.length === 0) continue;
      matchedWorkOrders += 1;

      for (const rule of matches) {
        const component = componentByCode.get(rule.componentCode)!;
        await tx.workOrderComponent.upsert({
          where: {
            workOrderId_componentRegistryId: {
              workOrderId: workOrder.id,
              componentRegistryId: component.id,
            },
          },
          update: {
            notes: `${PROVENANCE} Rule=${rule.key}; source title: ${title}`,
          },
          create: {
            workOrderId: workOrder.id,
            componentRegistryId: component.id,
            notes: `${PROVENANCE} Rule=${rule.key}; source title: ${title}`,
          },
        });
        upsertedLinks += 1;
        counts[rule.key] = (counts[rule.key] || 0) + 1;
      }
    }
  });

  console.log(JSON.stringify({
    asset,
    totalWorkOrders: workOrders.length,
    eligibleRSP5Titles: eligibleTitles,
    matchedWorkOrders,
    unmatchedEligible: eligibleTitles - matchedWorkOrders,
    coveragePct: eligibleTitles ? Number(((matchedWorkOrders / eligibleTitles) * 100).toFixed(1)) : 0,
    upsertedLinks,
    ruleLinks: counts,
    provenance: PROVENANCE,
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
