import { PrismaClient } from '@prisma/client';
if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) throw new Error('DATABASE_URL must point to PostgreSQL');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db = new PrismaClient({ adapter: createAdapter(process.env.DATABASE_URL) });

const TAG = 'UAT-GTP-802-1-045';
const PREFIX = 'GTP-STRIP';
const DRY_RUN = process.env.DRY_RUN === '1';
const EXCLUDE = /hand-head strapping machine|shutdown on engraving machine/i;

const RULES = [
  { key: 'air', code: 'SUB-AIR', re: /air leakage|air connected|air hose|air supply/i },
  { key: 'air-hose', code: 'PRT-AIR-HOSE', re: /air hose|air connected/i },
  { key: 'support-cylinder', code: 'CMP-SUPPORT-CYL', re: /support cylinder/i },
  { key: 'pressure-actuation', code: 'CMP-PRESS-ACT', re: /ending pressure|movement.*pressure|pressure.*movement/i },

  { key: 'water', code: 'CMP-HP-WATER', re: /water leakage|oil\s*&\s*water\s+leakage|water hose|water pipeline|water pipe line|water on the holes/i },
  { key: 'water-hose', code: 'PRT-WATER-HOSE', re: /water hose|high pressure.*hose/i },
  { key: 'water-pipe', code: 'PRT-WATER-PIPE', re: /water pipeline|water pipe line|pipe line.*stripping/i },
  { key: 'water-holes', code: 'CMP-WATER-HOLES', re: /water leakage on the holes|water.*holes/i },
  { key: 'nozzle-bar', code: 'CMP-NOZZLE-BAR', re: /nozzle bar/i },
  { key: 'nozzle-stopper', code: 'PRT-NOZZLE-STOP', re: /nozzle bar stopper/i },

  { key: 'oil-tank', code: 'CMP-OIL-TANK', re: /oil shortage.*tank|novo jet tank|nova jet tank/i },
  { key: 'oil-line', code: 'PRT-OIL-LINE', re: /oil leakage|oil\s*&\s*water\s+leakage/i },
  { key: 'pressure', code: 'CMP-PRESSURE', re: /unstable pressure|high pressure|check pressure|pressure on the stripping/i },

  { key: 'chiller', code: 'CMP-CHILLER', re: /chiller/i },
  { key: 'chiller-motor', code: 'CMP-CHILL-MOTOR', re: /chiller motor/i },
  { key: 'chiller-panel', code: 'CMP-CHILL-PANEL', re: /chiller panel/i },
  { key: 'chiller-display', code: 'INS-CHILL-DISPLAY', re: /display unit.*chiller|chiller.*display/i },

  { key: 'treatment-tank', code: 'CMP-TREAT-TANK', re: /screen treatment tank/i },
  { key: 'tank-bar', code: 'PRT-TANK-BAR', re: /broken bar.*screen treatment tank|screen treatment tank.*bar/i },
  { key: 'process', code: 'CMP-STRIP-MECH', re: /faulty jd stripping machine|faulty jd stripper|faulty nova jet|faulty stripping machine/i },

  { key: 'motor', code: 'CMP-MOTOR', re: /faulty motto|motor/i },
  { key: 'belt', code: 'PRT-MOTOR-BELT', re: /motor belt|torn motor belt/i },
  { key: 'bearing', code: 'PRT-BEARING', re: /bearings?/i },
  { key: 'movement', code: 'CMP-MOTION', re: /faulty movement/i },

  { key: 'panel', code: 'CMP-PANEL', re: /nova jet panel|main panel/i },
  { key: 'start', code: 'CMP-START', re: /start bottom|start button/i },
  { key: 'reset', code: 'CMP-RESET', re: /re-set bottom|reset bottom|reset button/i },
  { key: 'socket', code: 'CMP-SOCKET', re: /electrical socket|faulty socket/i },
  { key: 'light', code: 'CMP-LIGHT', re: /blinking light|dead bulb/i },
  { key: 'power', code: 'CMP-POWER', re: /unstable power supply/i },
  { key: 'pressure-ind', code: 'INS-PRESSURE', re: /check pressure|unstable pressure|high pressure/i },
  { key: 'support-alarm', code: 'INS-SUPPORT-ALARM', re: /support cylinder alarm/i },
] as const;

const MARKER = 'Auto-mapped from GTP Stripping Machine historical work-order title by conservative UAT commissioning rule; verify against OEM/master-data before production approval.';
function full(code: string) { return `${PREFIX}-${code}`; }

async function main() {
  const asset = await db.asset.findUnique({
    where: { assetTag: TAG },
    select: { id: true, assetTag: true, name: true },
  });
  if (!asset) throw new Error('Stripping Machine asset missing');

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
