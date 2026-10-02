import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) {
  throw new Error('DATABASE_URL must point to PostgreSQL');
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db = new PrismaClient({ adapter: createAdapter(process.env.DATABASE_URL) });

const TARGET_ASSET_TAG = 'UAT-GTP-314-1-001';
const PREFIX = 'GTP-MERC';

type NodeSpec = {
  code: string;
  name: string;
  type: 'assembly' | 'subassembly' | 'component' | 'part' | 'instrument';
  parent?: string;
  criticality?: string;
};

const HIERARCHY: NodeSpec[] = [
  { code: 'ASM-WEB', name: 'Infeed & Web Handling', type: 'assembly', criticality: 'high' },
  { code: 'SUB-INFEED', name: 'Infeed Roller Train', type: 'subassembly', parent: 'ASM-WEB' },
  { code: 'CMP-GUIDER', name: 'Foxwell Cloth Guider', type: 'component', parent: 'ASM-WEB', criticality: 'high' },
  { code: 'CMP-STRAIGHTENER', name: 'Cloth Straightener', type: 'component', parent: 'ASM-WEB' },
  { code: 'SUB-STENTER-CHAIN', name: 'Stenter Chain System', type: 'subassembly', parent: 'ASM-WEB', criticality: 'high' },
  { code: 'PRT-CHAIN-L', name: 'Left Stenter Chain', type: 'part', parent: 'SUB-STENTER-CHAIN', criticality: 'high' },
  { code: 'PRT-CHAIN-R', name: 'Right Stenter Chain', type: 'part', parent: 'SUB-STENTER-CHAIN', criticality: 'high' },
  { code: 'CMP-CHAIN-OPENER', name: 'Infeed Chain Opener', type: 'component', parent: 'SUB-STENTER-CHAIN' },
  { code: 'CMP-PLAITER', name: 'Plaiter', type: 'component', parent: 'ASM-WEB' },
  { code: 'CMP-OVERHEAD-ROLLER', name: 'Overhead Cylinder Roller', type: 'component', parent: 'ASM-WEB' },

  { code: 'ASM-CAUSTIC', name: 'Caustic Application & Circulation', type: 'assembly', criticality: 'critical' },
  { code: 'SUB-MAIN-CAUSTIC', name: 'Main Caustic Circuit', type: 'subassembly', parent: 'ASM-CAUSTIC', criticality: 'critical' },
  { code: 'CMP-CAUSTIC-PUMP', name: 'Main Caustic Circulation Pump', type: 'component', parent: 'SUB-MAIN-CAUSTIC', criticality: 'critical' },
  { code: 'CMP-CAUSTIC-FILTER', name: 'Caustic Filter', type: 'component', parent: 'SUB-MAIN-CAUSTIC' },
  { code: 'CMP-ENTRANCE-CAUSTIC-PUMP', name: 'Entrance Caustic Pump', type: 'component', parent: 'SUB-MAIN-CAUSTIC' },
  { code: 'SUB-WEAK-CAUSTIC', name: 'Weak Caustic Circuit', type: 'subassembly', parent: 'ASM-CAUSTIC', criticality: 'high' },
  { code: 'CMP-WEAK-CAUSTIC-PUMP', name: 'Weak Caustic Pump', type: 'component', parent: 'SUB-WEAK-CAUSTIC', criticality: 'high' },
  { code: 'CMP-WEAK-CAUSTIC-MOTOR', name: 'Weak Caustic Pump Motor', type: 'component', parent: 'SUB-WEAK-CAUSTIC' },
  { code: 'INS-WEAK-CAUSTIC-CTRL', name: 'Weak Caustic Flow Controller', type: 'instrument', parent: 'SUB-WEAK-CAUSTIC' },
  { code: 'CMP-CAUSTIC-MANGLE-1', name: 'First Caustic Mangle', type: 'component', parent: 'ASM-CAUSTIC', criticality: 'high' },
  { code: 'CMP-CAUSTIC-MANGLE-2', name: 'Second Caustic Mangle', type: 'component', parent: 'ASM-CAUSTIC', criticality: 'high' },

  { code: 'ASM-WASH', name: 'Washing, Cascade & Vacuum', type: 'assembly', criticality: 'high' },
  { code: 'SUB-WASH-1', name: 'Washing Tank 1', type: 'subassembly', parent: 'ASM-WASH' },
  { code: 'CMP-WASH-1-PUMP', name: 'Washing Tank 1 Pump', type: 'component', parent: 'SUB-WASH-1' },
  { code: 'PRT-WASH-1-STRAINER', name: 'Washing Tank 1 Strainer', type: 'part', parent: 'SUB-WASH-1' },
  { code: 'INS-WASH-1-FLOW', name: 'Washer 1 Flow Meter', type: 'instrument', parent: 'SUB-WASH-1' },
  { code: 'SUB-WASH-2', name: 'Washing Tank 2', type: 'subassembly', parent: 'ASM-WASH' },
  { code: 'CMP-WASH-2-PUMP', name: 'Washing Tank 2 Pump', type: 'component', parent: 'SUB-WASH-2' },
  { code: 'CMP-WASH-2-ROLLER', name: 'Washing Tank 2 Steel Roller', type: 'component', parent: 'SUB-WASH-2' },
  { code: 'SUB-CASCADE', name: 'Cascade Chamber System', type: 'subassembly', parent: 'ASM-WASH', criticality: 'high' },
  { code: 'CMP-CASCADE-PUMPS', name: 'Cascade Pumps 1–5', type: 'component', parent: 'SUB-CASCADE' },
  { code: 'INS-CASCADE-FLOW', name: 'Cascade Flow Metering', type: 'instrument', parent: 'SUB-CASCADE' },
  { code: 'PRT-CASCADE-STRAINERS', name: 'Cascade Chamber Strainers', type: 'part', parent: 'SUB-CASCADE' },
  { code: 'SUB-SUCTION', name: 'Suction & Vacuum System', type: 'subassembly', parent: 'ASM-WASH', criticality: 'high' },
  { code: 'CMP-SUCTION-PUMPS', name: 'Suction Pumps 1/2/4/6', type: 'component', parent: 'SUB-SUCTION' },
  { code: 'INS-VACUUM-GAUGES', name: 'Vacuum Gauges', type: 'instrument', parent: 'SUB-SUCTION' },

  { code: 'ASM-TENSION', name: 'Mangles, Compensators & Tension Control', type: 'assembly', criticality: 'high' },
  { code: 'CMP-COMP-1', name: 'First / Outfeed Compensator', type: 'component', parent: 'ASM-TENSION' },
  { code: 'CMP-COMP-2', name: 'Second Caustic Compensator', type: 'component', parent: 'ASM-TENSION' },
  { code: 'CMP-COMP-5', name: 'Compensator 5', type: 'component', parent: 'ASM-TENSION' },
  { code: 'PRT-COMP-5-CYL', name: 'Compensator 5 Pneumatic Cylinder', type: 'part', parent: 'CMP-COMP-5' },
  { code: 'CMP-BALANCER', name: 'Cloth Balancer', type: 'component', parent: 'ASM-TENSION' },
  { code: 'CMP-WATER-MANGLE', name: 'Water Mangle', type: 'component', parent: 'ASM-TENSION', criticality: 'high' },

  { code: 'ASM-DRIVE', name: 'Main Drive & Mechanical Transmission', type: 'assembly', criticality: 'critical' },
  { code: 'CMP-MAIN-DRIVE', name: 'Main Drive', type: 'component', parent: 'ASM-DRIVE', criticality: 'critical' },
  { code: 'CMP-MAIN-MOTOR', name: 'Main Drive Motor', type: 'component', parent: 'ASM-DRIVE', criticality: 'critical' },
  { code: 'SUB-GEARBOX', name: 'Gearbox Group', type: 'subassembly', parent: 'ASM-DRIVE' },
  { code: 'CMP-CASCADE-MOTOR', name: 'Cascade Motor Group', type: 'component', parent: 'ASM-DRIVE' },
  { code: 'CMP-SCROLL-MOTOR', name: 'Scroll Motor', type: 'component', parent: 'ASM-DRIVE' },

  { code: 'ASM-UTIL', name: 'Steam, Lagoon & Utility Piping', type: 'assembly', criticality: 'high' },
  { code: 'SUB-STEAM', name: 'Steam Supply & Trap System', type: 'subassembly', parent: 'ASM-UTIL', criticality: 'high' },
  { code: 'PRT-STEAM-TRAPS', name: 'Steam / Condensate Traps', type: 'part', parent: 'SUB-STEAM' },
  { code: 'PRT-STEAM-PIPES', name: 'Steam & Condensate Pipework', type: 'part', parent: 'SUB-STEAM' },
  { code: 'SUB-LAGOON', name: 'Lagoon 1–6 Utility Circuit', type: 'subassembly', parent: 'ASM-UTIL' },
  { code: 'PRT-LAGOON-VALVES', name: 'Lagoon Valves & Flanges', type: 'part', parent: 'SUB-LAGOON' },
  { code: 'PRT-DRAIN-VALVES', name: 'Caustic Pit & Underground Drain Valves', type: 'part', parent: 'ASM-UTIL' },

  { code: 'ASM-FLUID', name: 'Pneumatic & Hydraulic Systems', type: 'assembly', criticality: 'high' },
  { code: 'SUB-PNEU', name: 'Pneumatic Air Distribution', type: 'subassembly', parent: 'ASM-FLUID', criticality: 'high' },
  { code: 'PRT-AIR-LINES', name: 'Air Lines, Fittings & Regulators', type: 'part', parent: 'SUB-PNEU' },
  { code: 'CMP-PNEU-CYL', name: 'Pneumatic Cylinders', type: 'component', parent: 'SUB-PNEU' },
  { code: 'SUB-HYD', name: 'Water Mangle Hydraulic System', type: 'subassembly', parent: 'ASM-FLUID' },
  { code: 'CMP-HYD-PANEL', name: 'Hydraulic Power / Control Panel', type: 'component', parent: 'SUB-HYD' },

  { code: 'ASM-CTRL', name: 'Electrical, Controls & Instrumentation', type: 'assembly', criticality: 'high' },
  { code: 'CMP-OP-PANEL', name: 'Operator Control Panel', type: 'component', parent: 'ASM-CTRL', criticality: 'high' },
  { code: 'CMP-CAUSTIC-PANEL', name: 'Caustic Control Panel', type: 'component', parent: 'ASM-CTRL' },
  { code: 'INS-FLOW', name: 'Process Flow Instrumentation', type: 'instrument', parent: 'ASM-CTRL' },
  { code: 'INS-PRESSURE', name: 'Air / Vacuum Pressure Instrumentation', type: 'instrument', parent: 'ASM-CTRL' },
  { code: 'CMP-SEWING', name: 'Pegasus / Cloth Sewing Machine', type: 'component', parent: 'ASM-CTRL' },
];

function fullCode(code: string) { return `${PREFIX}-${code}`; }

async function main() {
  const asset = await db.asset.findUnique({ where: { assetTag: TARGET_ASSET_TAG }, select: { id: true, assetTag: true, name: true, plantId: true } });
  if (!asset) throw new Error(`${TARGET_ASSET_TAG} is missing`);

  const idByCode = new Map<string,string>();
  await db.$transaction(async (tx) => {
    for (let index = 0; index < HIERARCHY.length; index += 1) {
      const node = HIERARCHY[index];
      const componentCode = fullCode(node.code);
      const parentId = node.parent ? idByCode.get(node.parent) ?? null : null;
      if (node.parent && !parentId) throw new Error(`Parent ${node.parent} not yet commissioned for ${node.code}`);
      const notes = [
        'UAT hierarchy derived from GTP Mercerizer historical maintenance titles.',
        'Subsystem names are maintenance-oriented and must be verified against OEM drawings/nameplates before production master-data approval.',
      ].join(' ');
      const existing = await tx.componentRegistry.findUnique({ where: { componentCode }, select: { id: true } });
      const data = {
        assetId: asset.id,
        parentId,
        twinId: null,
        componentCode,
        name: node.name,
        description: null,
        componentType: node.type,
        manufacturer: null,
        modelNumber: null,
        serialNumber: null,
        specification: null,
        operatingParams: null,
        criticality: node.criticality ?? 'medium',
        lifecycleStatus: 'operational',
        installedDate: null,
        expectedLifeHours: null,
        operatingHours: 0,
        lastInspection: null,
        nextInspectionDue: null,
        healthScore: 100,
        sortOrder: index + 1,
        notes,
      };
      const saved = existing
        ? await tx.componentRegistry.update({ where: { id: existing.id }, data })
        : await tx.componentRegistry.create({ data });
      idByCode.set(node.code, saved.id);
    }
  });

  const rows = await db.componentRegistry.findMany({ where: { assetId: asset.id, componentCode: { startsWith: PREFIX } }, select: { id: true, parentId: true, componentCode: true } });
  const ids = new Set(rows.map((r) => r.id));
  const roots = rows.filter((r) => !r.parentId);
  const orphans = rows.filter((r) => r.parentId && !ids.has(r.parentId));
  if (rows.length !== HIERARCHY.length || roots.length !== 8 || orphans.length !== 0) {
    throw new Error(`Mercerizer hierarchy verification failed: nodes=${rows.length} roots=${roots.length} orphans=${orphans.length}`);
  }
  console.log(JSON.stringify({ asset, nodes: rows.length, roots: roots.length, orphans: orphans.length, status: 'PASS' }, null, 2));
}

main().catch((error) => { console.error(error); process.exit(1); }).finally(async () => db.$disconnect());
