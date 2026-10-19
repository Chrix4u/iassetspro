import { PrismaClient } from '@prisma/client';
if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) throw new Error('DATABASE_URL must point to PostgreSQL');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db = new PrismaClient({ adapter: createAdapter(process.env.DATABASE_URL) });

const TAG = 'UAT-GTP-310-1-004';
const PREFIX = 'GTP-BLR';
const DRY_RUN = process.env.DRY_RUN === '1';

const RULES = [
  { key: 'sat1', code: 'CMP-SAT1', re: /1st saturator|first saturator|saturator 1/i },
  { key: 'sat1-mangle', code: 'CMP-SAT1-MANGLE', re: /1st saturator.*mangle|saturator 1.*mangle|saturator mangle/i },
  { key: 'sat1-bowl', code: 'PRT-SAT1-BOWL', re: /1st saturator.*(?:bowl|squeezer|squizer)|saturator 1.*(?:bowl|squeezer|squizer)/i },
  { key: 'sat1-valve', code: 'PRT-SAT1-VALVE', re: /valve.*1st saturator|1st saturator.*valve/i },
  { key: 'sat2', code: 'CMP-SAT2', re: /2nd saturat|second saturat/i },
  { key: 'sat2-air', code: 'PRT-SAT2-AIR', re: /air leakage.*2nd saturat|2nd saturat.*air/i },
  { key: 'cloth-roll', code: 'CMP-CLOTH-ROLL', re: /cloth entanglement|cloth roll ?over|roll ?over gray/i },
  { key: 'grip-tape', code: 'PRT-GRIP-TAPE', re: /grip[e]? tape/i },

  { key: 'jbox1', code: 'CMP-JBOX1', re: /1st j[ .-]?box|j[ .-]?box 1|1st box/i },
  { key: 'jbox1-panel', code: 'CMP-JBOX1-PANEL', re: /j[ .-]?box panel/i },
  { key: 'jbox1-guide', code: 'PRT-JBOX1-GUIDE', re: /guide roller.*1st j|1st j.*guide roller/i },
  { key: 'jbox1-overflow', code: 'PRT-JBOX1-OVERFLOW', re: /j[ .-]?box 1.*over ?flow|1st j[ .-]?box.*over ?flow|c[ao]ustic overflow.*j/i },
  { key: 'jbox1-caustic', code: 'PRT-JBOX1-CAUSTIC', re: /j[ .-]?box 1.*c[ao]ustic (?:outlet|overflow)|1st j[ .-]?box.*c[ao]ustic/i },
  { key: 'jbox1-mangle', code: 'CMP-JBOX1-MANGLE', re: /1st j[ .-]?box.*mangle|1st box mangle/i },
  { key: 'jbox1-bowl', code: 'PRT-JBOX1-BOWL', re: /1st (?:j[ .-]?box|box).*bowl/i },
  { key: 'jbox1-coupling', code: 'PRT-JBOX1-COUPLING', re: /coupling.*1st j[ .-]?box|1st j[ .-]?box.*coupling/i },
  { key: 'jbox2', code: 'CMP-JBOX2', re: /2nd j[ .-]?box|j[ .-]?box 2/i },
  { key: 'comp-switch', code: 'INS-COMP-SW', re: /compensator switch/i },

  { key: 'washer1', code: 'SUB-W1', re: /washer ?#? ?1|1st washer|first washer/i },
  { key: 'w1-mangle', code: 'CMP-W1-MANGLE', re: /1st washer.*mangle|washer 1.*mangle/i },
  { key: 'w1-coupling', code: 'PRT-W1-COUPLING', re: /coupling.*1st washer|1st washer.*coupling/i },
  { key: 'w1-chain', code: 'PRT-W1-CHAIN', re: /chain.*washer 1|washer 1.*chain|chain.*1st washer|1st washer.*chain/i },
  { key: 'w1-solenoid', code: 'PRT-W1-SOLENOID', re: /solenoid valve.*1st washer|1st washer.*solenoid/i },
  { key: 'w1-water', code: 'PRT-W1-WATER', re: /water.*1st washer|1st washer.*water/i },
  { key: 'w1-drain', code: 'PRT-W1-DRAIN', re: /drain line.*1st washer|1st washer.*drain/i },

  { key: 'washer2', code: 'SUB-W2', re: /washer ?#? ?2|2nd washer|second washer|washing unit 2/i },
  { key: 'w2-squeezer', code: 'CMP-W2-SQ', re: /squeezer mangle.*washer 2|washer 2.*squeezer|squeezer.*2nd washer/i },
  { key: 'w2-chain', code: 'PRT-W2-CHAIN', re: /chain.*washer 2|washer 2.*chain|chain.*2nd washer|2nd washer.*chain/i },
  { key: 'w2-solenoid', code: 'PRT-W2-SOLENOID', re: /solenoid valve.*washer 2|washer 2.*solenoid/i },
  { key: 'w2-air', code: 'PRT-W2-AIR', re: /air leakage.*washer 2|washer 2.*air leakage|air leakage.*washing unit 2/i },
  { key: 'w2-temp', code: 'INS-W2-TEMP', re: /temperature reading|temprature reading|temperature gauge|temprature.*gauge/i },

  { key: 'washer3', code: 'SUB-W3', re: /washer ?#? ?3|3rd washer|third washer/i },
  { key: 'w3-squeezer', code: 'CMP-W3-SQ', re: /squeezer.*3rd washer|3rd washer.*squeezer/i },
  { key: 'w3-bowl', code: 'PRT-W3-BOWL', re: /squeezing bowl.*3rd washer|squeezer bowl.*3rd washer|3rd washer.*bowl/i },
  { key: 'w3-chain', code: 'PRT-W3-CHAIN', re: /chain.*3rd washer|3rd washer.*chain/i },
  { key: 'w3-air', code: 'PRT-W3-AIR', re: /air line.*3rd washer|air leakage.*3rd washer|3rd washer.*air/i },
  { key: 'w3-water', code: 'PRT-W3-WATER', re: /water.*3rd washer|3rd washer.*water|3rd washer down roller/i },
  { key: 'yard', code: 'INS-YARD', re: /yards? counter|yardage counter/i },
  { key: 'wash-roller', code: 'CMP-WASH-ROLLER', re: /washer tanks?|squeezer tools|down roller/i },
  { key: 'wash-bearing', code: 'PRT-WASH-BEAR', re: /bearings?.*washer|washer.*bearings?|marked bearings/i },

  { key: 'chemical-pump', code: 'CMP-CHEM-PUMP', re: /chemical pump/i },
  { key: 'washer1-pump', code: 'CMP-W1-PUMP', re: /pump to washer 1|pump.*1st washer/i },
  { key: 'washer3-pump', code: 'CMP-W3-PUMP', re: /pump behind 3rd washer/i },
  { key: 'wwtp-line', code: 'PRT-WWTP-LINE', re: /wwtp|aeration/i },
  { key: 'water-main', code: 'PRT-WATER-MAIN', re: /water pipe line|water supply line from 3rd washer to 2nd washer|water line leakage/i },
  { key: 'general-valve', code: 'PRT-VALVE', re: /faulty valve/i },

  { key: 'steam', code: 'SUB-STEAM', re: /steam supply|steam leakage|steam line/i },
  { key: 'steam-line', code: 'PRT-STEAM-LINE', re: /steam supply|steam leakage|steam line/i },
  { key: 'steam-valve', code: 'PRT-STEAM-VALVE', re: /valve.*steam line|steam line.*valve/i },
  { key: 'air', code: 'SUB-AIR', re: /air leakage|torn air line/i },
  { key: 'air-line', code: 'PRT-AIR-LINE', re: /air leakage|torn air line/i },
  { key: 'mangle-cylinder', code: 'CMP-MANGLE-CYL', re: /mangle cylinders?/i },

  { key: 'piler', code: 'CMP-PILER', re: /faulty piler|faulty piller|stationary piler|piler sprocket/i },
  { key: 'piler-sprocket', code: 'PRT-PILER-SPROCKET', re: /piler sprocket/i },
  { key: 'piler-shaft', code: 'PRT-PILER-SHAFT', re: /piler sprocket shaft|piler.*shaft/i },
  { key: 'sewing', code: 'CMP-SEW', re: /sewing machine/i },
  { key: 'needle', code: 'PRT-NEEDLE', re: /sewing machine needle|belt needle/i },

  { key: 'squeezer-motor', code: 'CMP-SQ-MOTOR', re: /squeezer motor|squeezer bowl motor/i },
  { key: 'motor-fan', code: 'PRT-MOTOR-FAN', re: /motor fan|blade cover/i },
  { key: 'motor-cable', code: 'PRT-MOTOR-CABLE', re: /squeezer motor.*cable|arrange cable/i },
  { key: 'drive-chain', code: 'PRT-DRIVE-CHAIN', re: /chain drives?|worn chains|retension chain|loose chain|loosed chain|faulty.*chains/i },

  { key: 'potmeter', code: 'INS-POT', re: /pot meter|potentiometer/i },
  { key: 'light', code: 'CMP-LIGHT', re: /dead bulb|faulty bulb/i },
  { key: 'electrical', code: 'CMP-ELEC', re: /panel not responding|electrical/i },

  { key: 'eyewash', code: 'CMP-EYEWASH', re: /emergency eye washer|eye washer/i },
  { key: 'grating', code: 'PRT-GRATING', re: /metal gratings?|gratings?/i },
  { key: 'pit', code: 'CMP-PIT', re: /water seepage into pit|water seepage into pits/i },
  { key: 'reservoir-cover', code: 'PRT-RES-COVER', re: /reservoir coverings?|reservior coverings?|broken hinges/i },
] as const;

const MARKER = 'Auto-mapped from GTP Bleaching Range historical work-order title by conservative UAT commissioning rule; verify against OEM/master-data before production approval.';
function full(code: string) { return `${PREFIX}-${code}`; }

async function main() {
  const asset = await db.asset.findUnique({
    where: { assetTag: TAG },
    select: { id: true, assetTag: true, name: true },
  });
  if (!asset) throw new Error('Bleaching Range asset missing');

  const workOrders = await db.workOrder.findMany({
    where: { assetId: asset.id },
    select: { id: true, woNumber: true, title: true },
    orderBy: { createdAt: 'asc' },
  });

  const matches = workOrders.map((workOrder) => {
    const title = workOrder.title || '';
    return { workOrder, rules: RULES.filter((rule) => rule.re.test(title)) };
  });
  const matched = matches.filter((entry) => entry.rules.length > 0);
  const unmatched = matches.filter((entry) => entry.rules.length === 0);
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
    unmatched: unmatched.map(({ workOrder }) => ({ woNumber: workOrder.woNumber, title: workOrder.title })),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(async () => db.$disconnect());
