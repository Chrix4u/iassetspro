import { PrismaClient } from '@prisma/client';
if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) throw new Error('DATABASE_URL must point to PostgreSQL');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db = new PrismaClient({ adapter: createAdapter(process.env.DATABASE_URL) });

const TAG = 'UAT-GTP-310-1-004';
const PREFIX = 'GTP-BLR';

type NodeSpec = {
  code: string;
  name: string;
  type: 'assembly' | 'subassembly' | 'component' | 'part' | 'instrument';
  parent?: string;
  criticality?: string;
};

const HIERARCHY: NodeSpec[] = [
  { code: 'ASM-SAT', name: 'Saturators, Infeed & Cloth Handling', type: 'assembly', criticality: 'high' },
  { code: 'CMP-SAT1', name: 'First Saturator', type: 'component', parent: 'ASM-SAT', criticality: 'high' },
  { code: 'CMP-SAT1-MANGLE', name: 'First Saturator Mangle', type: 'component', parent: 'CMP-SAT1' },
  { code: 'PRT-SAT1-BOWL', name: 'First Saturator Squeezer Bowl', type: 'part', parent: 'CMP-SAT1-MANGLE' },
  { code: 'PRT-SAT1-ROLLER', name: 'First Saturator Roller', type: 'part', parent: 'CMP-SAT1' },
  { code: 'PRT-SAT1-VALVE', name: 'First Saturator Valve', type: 'part', parent: 'CMP-SAT1' },
  { code: 'CMP-SAT2', name: 'Second Saturator', type: 'component', parent: 'ASM-SAT' },
  { code: 'PRT-SAT2-AIR', name: 'Second Saturator Air Line', type: 'part', parent: 'CMP-SAT2' },
  { code: 'CMP-CLOTH-ROLL', name: 'Cloth Rollover / Entanglement Path', type: 'component', parent: 'ASM-SAT' },
  { code: 'PRT-GRIP-TAPE', name: 'Cloth Grip Tape', type: 'part', parent: 'CMP-CLOTH-ROLL' },

  { code: 'ASM-JBOX', name: 'J-Box Treatment & Cloth Transfer', type: 'assembly', criticality: 'high' },
  { code: 'CMP-JBOX1', name: 'First J-Box', type: 'component', parent: 'ASM-JBOX', criticality: 'high' },
  { code: 'CMP-JBOX1-PANEL', name: 'First J-Box Control Panel', type: 'component', parent: 'CMP-JBOX1' },
  { code: 'PRT-JBOX1-GUIDE', name: 'First J-Box Guide Roller', type: 'part', parent: 'CMP-JBOX1' },
  { code: 'PRT-JBOX1-OVERFLOW', name: 'First J-Box Overflow Line', type: 'part', parent: 'CMP-JBOX1' },
  { code: 'PRT-JBOX1-CAUSTIC', name: 'First J-Box Caustic Outlet', type: 'part', parent: 'CMP-JBOX1' },
  { code: 'CMP-JBOX1-MANGLE', name: 'First J-Box Mangle', type: 'component', parent: 'CMP-JBOX1' },
  { code: 'PRT-JBOX1-BOWL', name: 'First J-Box Mangle Bowl', type: 'part', parent: 'CMP-JBOX1-MANGLE' },
  { code: 'PRT-JBOX1-COUPLING', name: 'First J-Box Mangle Coupling', type: 'part', parent: 'CMP-JBOX1-MANGLE' },
  { code: 'CMP-JBOX2', name: 'Second J-Box', type: 'component', parent: 'ASM-JBOX' },
  { code: 'INS-COMP-SW', name: 'J-Box Compensator Switch', type: 'instrument', parent: 'ASM-JBOX' },

  { code: 'ASM-WASH', name: 'Washer Train 1–3 & Squeezing Systems', type: 'assembly', criticality: 'high' },
  { code: 'SUB-W1', name: 'Washer 1', type: 'subassembly', parent: 'ASM-WASH', criticality: 'high' },
  { code: 'CMP-W1-MANGLE', name: 'Washer 1 Mangle', type: 'component', parent: 'SUB-W1' },
  { code: 'PRT-W1-COUPLING', name: 'Washer 1 Mangle Coupling', type: 'part', parent: 'CMP-W1-MANGLE' },
  { code: 'PRT-W1-CHAIN', name: 'Washer 1 Chain', type: 'part', parent: 'SUB-W1' },
  { code: 'PRT-W1-SOLENOID', name: 'Washer 1 Solenoid Valve', type: 'part', parent: 'SUB-W1' },
  { code: 'PRT-W1-WATER', name: 'Washer 1 Water Supply Line', type: 'part', parent: 'SUB-W1' },
  { code: 'PRT-W1-DRAIN', name: 'Washer 1 Drain Line', type: 'part', parent: 'SUB-W1' },

  { code: 'SUB-W2', name: 'Washer 2', type: 'subassembly', parent: 'ASM-WASH', criticality: 'high' },
  { code: 'CMP-W2-SQ', name: 'Washer 2 Squeezer Mangle', type: 'component', parent: 'SUB-W2' },
  { code: 'PRT-W2-CHAIN', name: 'Washer 2 Chain', type: 'part', parent: 'SUB-W2' },
  { code: 'PRT-W2-SOLENOID', name: 'Washer 2 Solenoid Valve', type: 'part', parent: 'SUB-W2' },
  { code: 'PRT-W2-AIR', name: 'Washer 2 Air Line', type: 'part', parent: 'SUB-W2' },
  { code: 'INS-W2-TEMP', name: 'Washer 2 Temperature Gauge', type: 'instrument', parent: 'SUB-W2' },

  { code: 'SUB-W3', name: 'Washer 3', type: 'subassembly', parent: 'ASM-WASH', criticality: 'high' },
  { code: 'CMP-W3-SQ', name: 'Washer 3 Squeezer Mangle', type: 'component', parent: 'SUB-W3' },
  { code: 'PRT-W3-BOWL', name: 'Washer 3 Squeezer Bowl', type: 'part', parent: 'CMP-W3-SQ' },
  { code: 'PRT-W3-CHAIN', name: 'Washer 3 Chain', type: 'part', parent: 'SUB-W3' },
  { code: 'PRT-W3-AIR', name: 'Washer 3 Air Line', type: 'part', parent: 'SUB-W3' },
  { code: 'PRT-W3-WATER', name: 'Washer 3 Water Line / Down Roller Seal Path', type: 'part', parent: 'SUB-W3' },
  { code: 'INS-YARD', name: 'Washer 3 Yard Counter', type: 'instrument', parent: 'SUB-W3' },
  { code: 'CMP-WASH-ROLLER', name: 'Washer Roller Train', type: 'component', parent: 'ASM-WASH' },
  { code: 'PRT-WASH-BEAR', name: 'Washer Roller Bearings', type: 'part', parent: 'CMP-WASH-ROLLER' },

  { code: 'ASM-CHEM', name: 'Chemical, Water & Effluent Distribution', type: 'assembly', criticality: 'high' },
  { code: 'CMP-CHEM-PUMP', name: 'Chemical Dosing / Transfer Pump', type: 'component', parent: 'ASM-CHEM' },
  { code: 'CMP-W1-PUMP', name: 'Washer 1 Pump', type: 'component', parent: 'ASM-CHEM' },
  { code: 'CMP-W3-PUMP', name: 'Washer 3 Pump', type: 'component', parent: 'ASM-CHEM' },
  { code: 'PRT-WWTP-LINE', name: 'Bleaching-to-WWTP / Aeration Line', type: 'part', parent: 'ASM-CHEM' },
  { code: 'PRT-WATER-MAIN', name: 'Bleaching Water Main & Inter-Washer Supply', type: 'part', parent: 'ASM-CHEM' },
  { code: 'PRT-VALVE', name: 'General Process Valve', type: 'part', parent: 'ASM-CHEM' },

  { code: 'ASM-UTIL', name: 'Steam & Pneumatic Utilities', type: 'assembly', criticality: 'high' },
  { code: 'SUB-STEAM', name: 'Steam Distribution', type: 'subassembly', parent: 'ASM-UTIL', criticality: 'high' },
  { code: 'PRT-STEAM-LINE', name: 'Steam Supply Lines', type: 'part', parent: 'SUB-STEAM' },
  { code: 'PRT-STEAM-VALVE', name: 'Steam Valves', type: 'part', parent: 'SUB-STEAM' },
  { code: 'SUB-AIR', name: 'Pneumatic Air Distribution', type: 'subassembly', parent: 'ASM-UTIL' },
  { code: 'PRT-AIR-LINE', name: 'Pneumatic Air Lines & Fittings', type: 'part', parent: 'SUB-AIR' },
  { code: 'CMP-MANGLE-CYL', name: 'Squeezing Mangle Pneumatic Cylinders', type: 'component', parent: 'SUB-AIR' },

  { code: 'ASM-OUT', name: 'Piler, Outfeed & Cloth Joining', type: 'assembly', criticality: 'high' },
  { code: 'CMP-PILER', name: 'Stationary Piler', type: 'component', parent: 'ASM-OUT', criticality: 'high' },
  { code: 'PRT-PILER-SPROCKET', name: 'Piler Sprocket', type: 'part', parent: 'CMP-PILER' },
  { code: 'PRT-PILER-SHAFT', name: 'Piler Sprocket Shaft', type: 'part', parent: 'CMP-PILER' },
  { code: 'CMP-SEW', name: 'Cloth Sewing Machine', type: 'component', parent: 'ASM-OUT' },
  { code: 'PRT-NEEDLE', name: 'Sewing Machine Needle', type: 'part', parent: 'CMP-SEW' },

  { code: 'ASM-DRIVE', name: 'Drives, Motors, Chains & Bearings', type: 'assembly', criticality: 'high' },
  { code: 'CMP-SQ-MOTOR', name: 'Squeezer / Mangle Drive Motor', type: 'component', parent: 'ASM-DRIVE' },
  { code: 'PRT-MOTOR-FAN', name: 'Motor Cooling Fan / Blade Cover', type: 'part', parent: 'CMP-SQ-MOTOR' },
  { code: 'PRT-MOTOR-CABLE', name: 'Motor Power Cable', type: 'part', parent: 'CMP-SQ-MOTOR' },
  { code: 'PRT-DRIVE-CHAIN', name: 'General Drive Chains', type: 'part', parent: 'ASM-DRIVE' },
  { code: 'PRT-DRIVE-BEAR', name: 'General Drive Bearings', type: 'part', parent: 'ASM-DRIVE' },

  { code: 'ASM-CTRL', name: 'Electrical Controls & Instrumentation', type: 'assembly', criticality: 'high' },
  { code: 'INS-POT', name: 'Potentiometer', type: 'instrument', parent: 'ASM-CTRL' },
  { code: 'CMP-LIGHT', name: 'Machine Lighting', type: 'component', parent: 'ASM-CTRL' },
  { code: 'CMP-ELEC', name: 'General Electrical Control System', type: 'component', parent: 'ASM-CTRL' },

  { code: 'ASM-SAFE', name: 'Safety, Pits & Access Infrastructure', type: 'assembly', criticality: 'critical' },
  { code: 'CMP-EYEWASH', name: 'Emergency Eye Washer Area', type: 'component', parent: 'ASM-SAFE', criticality: 'critical' },
  { code: 'PRT-GRATING', name: 'Emergency Area Metal Gratings', type: 'part', parent: 'CMP-EYEWASH' },
  { code: 'CMP-PIT', name: 'Bleaching Collection Pits', type: 'component', parent: 'ASM-SAFE' },
  { code: 'PRT-RES-COVER', name: 'Underground Reservoir Cover & Hinges', type: 'part', parent: 'ASM-SAFE' },
];

function full(code: string) { return `${PREFIX}-${code}`; }

async function main() {
  const asset = await db.asset.findUnique({
    where: { assetTag: TAG },
    select: { id: true, assetTag: true, name: true, plantId: true },
  });
  if (!asset) throw new Error('Bleaching Range asset missing');

  const ids = new Map<string, string>();
  await db.$transaction(async (tx) => {
    for (let i = 0; i < HIERARCHY.length; i++) {
      const node = HIERARCHY[i];
      const parentId = node.parent ? ids.get(node.parent) ?? null : null;
      if (node.parent && !parentId) throw new Error(`Missing parent ${node.parent}`);
      const componentCode = full(node.code);
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
        sortOrder: i + 1,
        notes: 'UAT hierarchy derived from GTP Bleaching Range historical maintenance titles. Maintenance-oriented subsystem names are provisional and require OEM/nameplate/master-data verification before production approval.',
      };
      const saved = existing
        ? await tx.componentRegistry.update({ where: { id: existing.id }, data })
        : await tx.componentRegistry.create({ data });
      ids.set(node.code, saved.id);
    }
  });

  const rows = await db.componentRegistry.findMany({
    where: { assetId: asset.id, componentCode: { startsWith: PREFIX } },
    select: { id: true, parentId: true },
  });
  const idsSet = new Set(rows.map((row) => row.id));
  const roots = rows.filter((row) => !row.parentId);
  const orphans = rows.filter((row) => row.parentId && !idsSet.has(row.parentId));

  if (rows.length !== HIERARCHY.length || roots.length !== 9 || orphans.length) {
    throw new Error(`Bleaching Range hierarchy failed nodes=${rows.length} roots=${roots.length} orphans=${orphans.length}`);
  }

  console.log(JSON.stringify({
    asset,
    expectedNodes: HIERARCHY.length,
    nodes: rows.length,
    roots: roots.length,
    orphans: orphans.length,
    status: 'PASS',
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(async () => db.$disconnect());
