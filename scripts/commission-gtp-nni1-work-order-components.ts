import { PrismaClient } from '@prisma/client';
if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) throw new Error('DATABASE_URL must point to PostgreSQL');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db = new PrismaClient({ adapter: createAdapter(process.env.DATABASE_URL) });

const TAG = 'UAT-GTP-372-1-039';
const PREFIX = 'GTP-NNI1';
const DRY_RUN = process.env.DRY_RUN === '1';
const EXCLUDE = /wall fan|concrete|gutter|azoic machine/i;

const RULES = [
  { key: 'guider', code: 'CMP-GUIDER', re: /foxwell guider|cloth guider/i },
  { key: 'in-comp', code: 'CMP-IN-COMP', re: /compensator.*infeed|infeed.*compensator/i },
  { key: 'out-comp', code: 'CMP-OUT-COMP', re: /compensator.*outfeed|outfeed.*compensator/i },
  { key: 'web', code: 'ASM-WEB', re: /faulty compensator.*NNI|folding cloth/i },
  { key: 'chem-trough', code: 'CMP-CHEM-TROUGH', re: /chemical tought|chemical trough/i },
  { key: 'sewing', code: 'CMP-SEW', re: /sewing machine/i },
  { key: 'needle', code: 'PRT-NEEDLE', re: /needle/i },

  { key: 'fix-pump', code: 'CMP-FIX-PUMP', re: /fixation pump/i },
  { key: 'chemical-pump', code: 'CMP-CHEM-PUMP', re: /chemical pump/i },
  { key: 'colour-pump', code: 'CMP-COLOUR-PUMP', re: /colour pump/i },
  { key: 'colour-motor', code: 'CMP-COLOUR-MOTOR', re: /colour pumping motor/i },
  { key: 'colour-box', code: 'CMP-COLOUR-BOX', re: /colour box/i },

  { key: 'fix-mangle', code: 'CMP-FIX-MANGLE', re: /fixation mangle/i },
  { key: 'out-mangle', code: 'CMP-OUT-MANGLE', re: /outfeed mangle/i },
  { key: 'mangle', code: 'ASM-MANGLE', re: /faulty mangle.*NNI|mangle on the NNI/i },

  { key: 'steam', code: 'SUB-STEAM', re: /steam line|steam leakage|steam trap|steam valve|steam situation|steam exchanger/i },
  { key: 'steam-line', code: 'PRT-STEAM-LINE', re: /steam line|steam leakage/i },
  { key: 'steam-trap', code: 'PRT-STEAM-TRAP', re: /steam traps?/i },
  { key: 'steam-valve', code: 'PRT-STEAM-VALVE', re: /steam valve/i },
  { key: 'exchanger', code: 'CMP-EXCHANGER', re: /steam exchanger/i },
  { key: 'sample-chamber', code: 'CMP-SAMPLE-CHAMBER', re: /sample chamber.*steam|steam leakage.*sample chamber/i },

  { key: 'dry-cylinder', code: 'CMP-DRY-CYL', re: /drying cylinder/i },
  { key: 'fan', code: 'CMP-CIRC-FAN', re: /circulation fan|faulty fans? on the NNI/i },
  { key: 'oven', code: 'CMP-OVEN', re: /oven doors?|NNI chambers?|open the NNI machine|opening of NNI/i },
  { key: 'oven-door', code: 'PRT-OVEN-DOOR', re: /oven doors?/i },
  { key: 'door-lock', code: 'PRT-DOOR-LOCK', re: /locking device.*doors|permanent systerm.*open the NNI/i },

  { key: 'air', code: 'SUB-AIR', re: /air leakage/i },
  { key: 'air-line', code: 'PRT-AIR-LINE', re: /air leakage/i },

  { key: 'motor', code: 'CMP-MOTOR', re: /faulty motor on the NNI|motor fan plates/i },
  { key: 'bearing', code: 'PRT-BEARING', re: /broken bearing/i },
  { key: 'motor-fan', code: 'PRT-MOTOR-FAN', re: /motor fan plates?/i },

  { key: 'panel', code: 'CMP-PANEL', re: /electrical panels?|non-responding electrical panels/i },
  { key: 'electrical', code: 'CMP-ELEC', re: /electrical fault/i },
  { key: 'light', code: 'CMP-LIGHT', re: /lighting system|light switch|lightning system/i },
  { key: 'light-switch', code: 'PRT-LIGHT-SW', re: /light switch/i },
] as const;

const MARKER = 'Auto-mapped from GTP NNI Machine 1 historical work-order title by conservative UAT commissioning rule; verify against OEM/master-data before production approval.';
function full(code: string) { return `${PREFIX}-${code}`; }

async function main() {
  const asset = await db.asset.findUnique({
    where: { assetTag: TAG },
    select: { id: true, assetTag: true, name: true },
  });
  if (!asset) throw new Error('NNI Machine 1 asset missing');

  const workOrders = await db.workOrder.findMany({
    where: { assetId: asset.id },
    select: { id: true, woNumber: true, title: true },
    orderBy: { createdAt: 'asc' },
  });

  const evaluated = workOrders.map((workOrder) => {
    const title = workOrder.title || '';
    const excluded = EXCLUDE.test(title);
    return { workOrder, excluded, rules: excluded ? [] : RULES.filter((rule) => rule.re.test(title)) };
  });

  const matched = evaluated.filter((entry) => entry.rules.length > 0);
  const unmatched = evaluated.filter((entry) => entry.rules.length === 0);
  const ruleLinks: Record<string, number> = {};
  let links = 0;

  for (const entry of matched) {
    for (const rule of entry.rules) {
      links += 1;
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
    matchedWorkOrders: matched.length,
    coveragePct: Number((matched.length / Math.max(workOrders.length, 1) * 100).toFixed(1)),
    linkCount: links,
    ruleLinks,
    unmatched: unmatched.map(({ workOrder, excluded }) => ({
      woNumber: workOrder.woNumber,
      title: workOrder.title,
      excluded,
    })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(async () => db.$disconnect());
