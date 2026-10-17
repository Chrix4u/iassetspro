import { PrismaClient } from '@prisma/client';
if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) throw new Error('DATABASE_URL must point to PostgreSQL');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db = new PrismaClient({ adapter: createAdapter(process.env.DATABASE_URL) });

const TAG = 'UAT-GTP-333-1-005';
const PREFIX = 'GTP-CST';
const DRY_RUN = process.env.DRY_RUN === '1';
const EXCLUDE = /drying range/i;

const RULES = [
  { key: 'rollover', code: 'CMP-ROLLOVER', re: /roll[- ]?over|rolled over|rollover/i },
  { key: 'infeed', code: 'CMP-INFEED', re: /infeed/i },
  { key: 'guider', code: 'CMP-GUIDER', re: /foxwell guider/i },
  { key: 'draw-roller', code: 'CMP-DRAW-ROLLER', re: /cloth drawn roller/i },
  { key: 'draw-bearing', code: 'PRT-DRAW-BEAR', re: /bearing.*cloth drawn roller|cloth drawn roller.*bearing/i },
  { key: 'grip-tape', code: 'PRT-GRIP-TAPE', re: /grip tape/i },
  { key: 'infeed-chain', code: 'PRT-INFEED-CHAIN', re: /chain.*infeed|infeed.*chain/i },

  { key: 'main-chain', code: 'SUB-MAIN-CHAIN', re: /tension chain|inside chain|loosed chain/i },
  { key: 'inside-chain', code: 'PRT-INSIDE-CHAIN', re: /inside chain/i },
  { key: 'tension-sprocket', code: 'PRT-TENSION-SPROCKET', re: /tension sprocket/i },
  { key: 'chain-sprocket', code: 'PRT-CHAIN-SPROCKET', re: /chain sprocket/i },

  { key: 'cylinder2', code: 'CMP-CYL2', re: /cylinder (?:number )?2|dry cylinder 2/i },
  { key: 'cylinder2-shaft', code: 'PRT-CYL2-SHAFT', re: /cylinder.*end shaft|end shaft.*cylinder/i },
  { key: 'cylinder-nub', code: 'PRT-CYL-NUB', re: /nub on the cylinder/i },
  { key: 'cylinder-grip', code: 'PRT-CYL-GRIP', re: /grip tape.*dry cylinder 2|dry cylinder 2.*grip tape/i },

  { key: 'steam', code: 'SUB-STEAM', re: /steam leakage|steam leakages|steam tank|steam indicating|steam indicator/i },
  { key: 'steam-tank', code: 'CMP-STEAM-TANK', re: /steam tanks?/i },
  { key: 'steam-line', code: 'PRT-STEAM-LINE', re: /steam leakage|steam leakages|pipe fitter.*steam/i },
  { key: 'alizarine', code: 'PRT-ALIZARINE', re: /alizarine/i },
  { key: 'lagging', code: 'PRT-LAGGING', re: /lagging/i },
  { key: 'condensate', code: 'PRT-CONDENSATE', re: /condensate/i },
  { key: 'water-line', code: 'PRT-WATER-LINE', re: /water leakage|water pipeline/i },
  { key: 'air-tube', code: 'PRT-AIR-TUBE', re: /air tube/i },
  { key: 'air-line', code: 'PRT-AIR-LINE', re: /air leakage/i },

  { key: 'plaiter-out', code: 'ASM-OUT', re: /plaiter outfeed/i },
  { key: 'plaiter1', code: 'CMP-PLAIT1', re: /plaiter 1|plaiter1/i },
  { key: 'plaiter1-arm', code: 'PRT-PLAIT1-ARM', re: /plaiter 1 arm|plaiter1 arm/i },
  { key: 'plaiter1-stud', code: 'PRT-PLAIT1-STUD', re: /stud.*plaiter 1 arm|plaiter 1 arm.*stud/i },
  { key: 'plaiter2', code: 'CMP-PLAIT2', re: /plaiter 2|plaiter 2&9/i },
  { key: 'plaiter9', code: 'CMP-PLAIT9', re: /plaiter 9|plaiter 2&9/i },

  { key: 'sewing', code: 'CMP-SEW', re: /sewing machine/i },
  { key: 'needle', code: 'PRT-NEEDLE', re: /needle|niddle/i },
  { key: 'sew-cable', code: 'PRT-SEW-CABLE', re: /live cable.*sewing|sewing machine.*cable/i },

  { key: 'main-drive', code: 'CMP-MAIN-DRIVE', re: /faulty drive|fix faulty drive/i },
  { key: 'infeed-drive', code: 'CMP-INFEED-DRIVE', re: /infeed is not working|faulty machine \(infeed\)/i },
  { key: 'drive-belt', code: 'PRT-DRIVE-BELT', re: /worn-out belt|worn out belt/i },

  { key: 'main-panel', code: 'CMP-MAIN-PANEL', re: /main panel/i },
  { key: 'reset', code: 'CMP-RESET', re: /reset the continuous steamer|reset.*steamer/i },
  { key: 'electrical', code: 'CMP-ELEC', re: /electrical fault/i },
  { key: 'steam-light', code: 'INS-STEAM-LIGHT', re: /steam indicating light/i },
  { key: 'steam-indicator', code: 'INS-STEAM-IND', re: /steam indicator/i },

  { key: 'estop', code: 'CMP-ESTOP', re: /emergency switch/i },
  { key: 'extinguisher', code: 'CMP-EXTING', re: /fire extinguisher|fire extingusher/i },
  { key: 'ext-hook', code: 'PRT-EXT-HOOK', re: /hook.*fire extinguisher|hook.*fire extingusher/i },
] as const;

const MARKER = 'Auto-mapped from GTP Continuous Steamer historical work-order title by conservative UAT commissioning rule; verify against OEM/master-data before production approval.';
function full(code: string) { return `${PREFIX}-${code}`; }

async function main() {
  const asset = await db.asset.findUnique({
    where: { assetTag: TAG },
    select: { id: true, assetTag: true, name: true },
  });
  if (!asset) throw new Error('Continuous Steamer asset missing');

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
