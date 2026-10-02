import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) {
  throw new Error('DATABASE_URL must point to PostgreSQL');
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db = new PrismaClient({ adapter: createAdapter(process.env.DATABASE_URL) });

const TARGET_ASSET_TAG = 'UAT-GTP-309-2-002';
const PREFIX = 'GTP-RS2';
const PROVENANCE = 'Auto-mapped from GTP Rope Soaper Machine 2 historical work-order title by conservative UAT commissioning rule; verify against OEM/master-data before production approval.';

const RULES = [
  { key: 'sewing', code: 'CMP-SEWING-MACHINE', re: /sewing|needle|pegasus/i },
  { key: 'chain', code: 'PRT-CHAIN', re: /\bchain\b/i },
  { key: 'gearbox', code: 'CMP-GEARBOX', re: /gear\s*box/i },
  { key: 'coupling', code: 'CMP-COUPLING', re: /coupling/i },
  { key: 'scutcher', code: 'CMP-SCUTCHER', re: /scutcher|sketcher/i },
  { key: 'bow', code: 'CMP-BOW', re: /\bbow\b/i },
  { key: 'spiral-roller', code: 'CMP-SPIRAL-ROLLER', re: /spiral\s+roller/i },
  { key: 'basket-roller', code: 'CMP-BASKET-ROLLER', re: /(basket|barket)\s+roller/i },
  { key: 'squeezer', code: 'CMP-SQUEEZER', re: /squeezer|squeeze/i },
  { key: 'mangle', code: 'CMP-MANGLE', re: /mangle/i },
  { key: 'dosing', code: 'SUB-DOSING', re: /dos(?:ing|e)|dozing/i },
  { key: 'pump', code: 'CMP-DOSING-PUMP', re: /\bpumps?\b/i },
  { key: 'pneumatic', code: 'SUB-AIR', re: /pneumatic|air\s+leak|air\s+cylinder|air\s+line|air\s+pressure/i },
  { key: 'steam', code: 'SUB-STEAM', re: /steam|condensate|pipe\s*lines?/i },
  { key: 'valve', code: 'CMP-BUTTERFLY-VALVE', re: /valve/i },
  { key: 'drainage', code: 'SUB-DRAIN', re: /drain|gutter/i },
  { key: 'fan', code: 'CMP-EXTRACTION-FAN', re: /\bfan\b|extraction/i },
  { key: 'controls', code: 'CMP-CONTROL-PANEL', re: /control|electrical|spark|knob|nob|panel|lighting|flourescent|fluorescent|bulb|socket/i },
  { key: 'motor', code: 'CMP-DRIVE-MOTOR', re: /\bmotor\b/i },
  { key: 'belt', code: 'PRT-DRIVE-BELT', re: /\bbelt\b|\bbeli\b|grip\s*tape/i },
  { key: 'roller', code: 'PRT-PROCESS-ROLLER', re: /\broller\b|\bbowl\b/i },
  { key: 'cloth-handling', code: 'CMP-CLOTH-HANDLING', re: /cloth\s+(rollover|separation|seperation)|pot\s*eye|eye\s*pot|guider|guide|threading\s+bar/i },
  { key: 'compartment-1', code: 'SUB-COMP-1', re: /compartment\s*(?:#\s*)?1\b|1st\s+compartment|first\s+compartment/i },
  { key: 'compartment-2', code: 'SUB-COMP-2', re: /compartment\s*(?:#\s*)?2\b|2nd\s+compartment|second\s+compartment/i },
  { key: 'compartment-3', code: 'SUB-COMP-3', re: /compartment\s*(?:#\s*)?3\b|3rd\s+compartment|third\s+compartment/i },
  { key: 'compartment-4', code: 'SUB-COMP-4', re: /compartment\s*(?:#\s*)?4\b|4th\s+compartment|fourth\s+compartment/i },
  { key: 'compartment-5', code: 'SUB-COMP-5', re: /compartment\s*(?:#\s*)?5\b|5th\s+compartment|fifth\s+compartment/i },
  { key: 'compartment-6', code: 'SUB-COMP-6', re: /compartment\s*(?:#\s*)?6\b|6th\s+compartment|sixth\s+compartment/i },
] as const;

function fullCode(code: string) {
  return PREFIX + '-' + code;
}

async function main() {
  const asset = await db.asset.findUnique({
    where: { assetTag: TARGET_ASSET_TAG },
    select: { id: true, assetTag: true, name: true },
  });
  if (!asset) throw new Error(TARGET_ASSET_TAG + ' is missing');

  const components = await db.componentRegistry.findMany({
    where: {
      assetId: asset.id,
      componentCode: { in: RULES.map((rule) => fullCode(rule.code)) },
    },
    select: { id: true, componentCode: true },
  });
  const componentByCode = new Map(components.map((component) => [component.componentCode, component.id]));

  for (const rule of RULES) {
    if (!componentByCode.has(fullCode(rule.code))) {
      throw new Error('Missing required component ' + fullCode(rule.code));
    }
  }

  const workOrders = await db.workOrder.findMany({
    where: { assetId: asset.id },
    select: { id: true, woNumber: true, title: true },
  });

  let matchedWorkOrders = 0;
  let upsertedLinks = 0;
  const counts: Record<string, number> = {};

  await db.$transaction(async (tx) => {
    for (const workOrder of workOrders) {
      const title = workOrder.title || '';
      const matches = RULES.filter((rule) => rule.re.test(title));
      if (matches.length === 0) continue;
      matchedWorkOrders += 1;

      for (const rule of matches) {
        const componentRegistryId = componentByCode.get(fullCode(rule.code))!;
        await tx.workOrderComponent.upsert({
          where: {
            workOrderId_componentRegistryId: {
              workOrderId: workOrder.id,
              componentRegistryId,
            },
          },
          update: {
            notes: PROVENANCE + ' Rule=' + rule.key + '; source title: ' + title,
          },
          create: {
            workOrderId: workOrder.id,
            componentRegistryId,
            notes: PROVENANCE + ' Rule=' + rule.key + '; source title: ' + title,
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
    matchedWorkOrders,
    unmatchedWorkOrders: workOrders.length - matchedWorkOrders,
    upsertedLinks,
    ruleLinks: counts,
    provenance: PROVENANCE,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(async () => db.$disconnect());
