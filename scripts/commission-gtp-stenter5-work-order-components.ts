import { PrismaClient } from '@prisma/client';
if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) throw new Error('DATABASE_URL must point to PostgreSQL');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db = new PrismaClient({ adapter: createAdapter(process.env.DATABASE_URL) });

const TAG = 'UAT-GTP-340-5-007';
const PREFIX = 'GTP-ST5';
const DRY_RUN = process.env.DRY_RUN === '1';
const EXCLUDE = /stenter 6 machine|woodin platfoam|woodin pallets|air condition|chemical trolley/i;

const RULES = [
  { key: 'guider', code: 'CMP-GUIDER', re: /foxwell guider/i },
  { key: 'compensator', code: 'CMP-COMP', re: /infeed compensator/i },
  { key: 'straightener', code: 'CMP-STRAIGHT', re: /straightener|straightner/i },
  { key: 'straight-roller', code: 'PRT-STRAIGHT-ROLLER', re: /rollers?.*straightener|rollers?.*straightner/i },
  { key: 'feeler', code: 'CMP-FEELER', re: /feeler head/i },
  { key: 'drain', code: 'CMP-DRAIN', re: /infeed drain/i },
  { key: 'sieve', code: 'PRT-DRAIN-SIEVE', re: /metal sieve/i },

  { key: 'chem-trough', code: 'CMP-CHEM-TROUGH', re: /chemical.*trough/i },
  { key: 'chem-tank', code: 'CMP-CHEM-TANK', re: /chemical tanks?/i },
  { key: 'chem-pump', code: 'CMP-CHEM-PUMP', re: /chemical pump/i },
  { key: 'stirrer', code: 'CMP-STIRRER', re: /stirrer motor/i },
  { key: 'chem-sensor', code: 'INS-CHEM-SENSOR', re: /chemical tray.*sensor|infeed chemical sensor/i },
  { key: 'chem-limit', code: 'INS-CHEM-LIMIT', re: /chemical limit sensor/i },

  { key: 'chain', code: 'CMP-STENTER-CHAIN', re: /stenter chain|stater chain|faulty chain on the stenter 5|broken chain.*stenter 5/i },
  { key: 'pins', code: 'PRT-PINS', re: /broken pins?/i },
  { key: 'clips', code: 'PRT-CLIPS', re: /clips?/i },
  { key: 'shoes', code: 'PRT-SHOES', re: /broken shoes/i },
  { key: 'chain-cover', code: 'PRT-CHAIN-COVER', re: /chain cover/i },
  { key: 'batch-arm', code: 'CMP-BATCH-ARM', re: /batching arm/i },
  { key: 'batch-chain', code: 'PRT-BATCH-CHAIN', re: /chain.*batching arm|batching arm.*chain/i },

  { key: 'mangle', code: 'CMP-MANGLE', re: /mangle/i },

  { key: 'fan1', code: 'CMP-FAN1', re: /fan.*number 1|fan no:? ?1/i },
  { key: 'fan2', code: 'CMP-FAN2', re: /fan no:? ?2|fan.*number 2/i },
  { key: 'fans', code: 'ASM-DRY', re: /fans rotation|faulty fan/i },
  { key: 'fan-chain', code: 'PRT-FAN-CHAIN', re: /fan chain|fam chain/i },

  { key: 'main-drive', code: 'CMP-MAIN-DRIVE', re: /main drive/i },
  { key: 'drive-shaft', code: 'PRT-DRIVE-SHAFT', re: /main drive.*shaft|drive shaft/i },
  { key: 'drive-chain', code: 'PRT-DRIVE-CHAIN', re: /main drive.*chain|drive shaft chain/i },
  { key: 'bearing', code: 'PRT-BEARING', re: /bearing/i },
  { key: 'lifter', code: 'CMP-LIFTER', re: /lifter/i },
  { key: 'scroll', code: 'CMP-SCROLL', re: /scroll roller/i },
  { key: 'scroll-lever', code: 'PRT-SCROLL-LEVER', re: /scroll roller lever/i },

  { key: 'out-bed', code: 'CMP-OUT-BED', re: /outfeed.*bed|bed of the outfeed/i },
  { key: 'bed-width', code: 'CMP-BED-WIDTH', re: /bed width/i },
  { key: 'yard', code: 'INS-YARD', re: /yardage counter/i },
  { key: 'selvedge', code: 'INS-SELVEDGE', re: /selvedge sensor/i },
  { key: 'out-light', code: 'CMP-OUT-LIGHT', re: /fluorescent tube.*outfeed|outfeed.*fluorescent/i },

  { key: 'sewing', code: 'CMP-SEW', re: /sewing m\/c|sewing machine/i },
  { key: 'needle', code: 'PRT-NEEDLE', re: /needle/i },
  { key: 'sew-cable', code: 'PRT-SEW-CABLE', re: /exposed wire.*sewing|sewing.*cable/i },
  { key: 'sew-socket', code: 'PRT-SEW-SOCKET', re: /sewing machine socket|sewing m\/c.*socket/i },

  { key: 'air', code: 'SUB-AIR', re: /air leakage|air hose/i },
  { key: 'air-hose', code: 'PRT-AIR-HOSE', re: /air hose/i },
  { key: 'air-line', code: 'PRT-AIR-LINE', re: /air leakage/i },
  { key: 'steam', code: 'SUB-STEAM', re: /steam leakage|steam pipe/i },
  { key: 'steam-line', code: 'PRT-STEAM-LINE', re: /steam leakage|main pipe.*stenter 5/i },
  { key: 'water-line', code: 'PRT-WATER-LINE', re: /reuse water pipeline/i },
  { key: 'valve', code: 'PRT-PROC-VALVE', re: /blocked valve/i },

  { key: 'panel', code: 'CMP-PANEL', re: /stenter 5 panel/i },
  { key: 'reset', code: 'CMP-RESET', re: /reset button|reset switch|reset unfunctional/i },
  { key: 'sync', code: 'CMP-SYNC', re: /syncronization|synchronization/i },
  { key: 'electrical', code: 'CMP-ELEC', re: /electrical fault/i },
] as const;

const MARKER = 'Auto-mapped from GTP Stenter 5 historical work-order title by conservative UAT commissioning rule; verify against OEM/master-data before production approval.';
function full(code: string) { return `${PREFIX}-${code}`; }

async function main() {
  const asset = await db.asset.findUnique({
    where: { assetTag: TAG },
    select: { id: true, assetTag: true, name: true },
  });
  if (!asset) throw new Error('Stenter 5 asset missing');

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
