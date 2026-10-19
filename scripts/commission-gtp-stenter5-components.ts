import { PrismaClient } from '@prisma/client';
if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) throw new Error('DATABASE_URL must point to PostgreSQL');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db = new PrismaClient({ adapter: createAdapter(process.env.DATABASE_URL) });

const TAG = 'UAT-GTP-340-5-007';
const PREFIX = 'GTP-ST5';

type NodeSpec = {
  code: string;
  name: string;
  type: 'assembly' | 'subassembly' | 'component' | 'part' | 'instrument';
  parent?: string;
  criticality?: string;
};

const HIERARCHY: NodeSpec[] = [
  { code: 'ASM-INFEED', name: 'Infeed, Guiding & Straightening', type: 'assembly', criticality: 'high' },
  { code: 'CMP-GUIDER', name: 'Foxwell Guider', type: 'component', parent: 'ASM-INFEED' },
  { code: 'CMP-COMP', name: 'Infeed Compensator', type: 'component', parent: 'ASM-INFEED' },
  { code: 'CMP-STRAIGHT', name: 'Cloth Straightener', type: 'component', parent: 'ASM-INFEED' },
  { code: 'PRT-STRAIGHT-ROLLER', name: 'Straightener Rollers', type: 'part', parent: 'CMP-STRAIGHT' },
  { code: 'CMP-FEELER', name: 'Feeler Head', type: 'component', parent: 'ASM-INFEED' },
  { code: 'CMP-DRAIN', name: 'Infeed Drain', type: 'component', parent: 'ASM-INFEED' },
  { code: 'PRT-DRAIN-SIEVE', name: 'Infeed Drain Metal Sieve', type: 'part', parent: 'CMP-DRAIN' },

  { code: 'ASM-CHEM', name: 'Chemical Preparation & Feed', type: 'assembly', criticality: 'high' },
  { code: 'CMP-CHEM-TROUGH', name: 'Chemical Trough', type: 'component', parent: 'ASM-CHEM' },
  { code: 'CMP-CHEM-TANK', name: 'Chemical Tank', type: 'component', parent: 'ASM-CHEM' },
  { code: 'CMP-CHEM-PUMP', name: 'Chemical Pump', type: 'component', parent: 'ASM-CHEM' },
  { code: 'CMP-STIRRER', name: 'Chemical Stirrer Motor', type: 'component', parent: 'ASM-CHEM' },
  { code: 'INS-CHEM-SENSOR', name: 'Chemical Tray / Infeed Sensor', type: 'instrument', parent: 'ASM-CHEM' },
  { code: 'INS-CHEM-LIMIT', name: 'Chemical Limit Sensor', type: 'instrument', parent: 'ASM-CHEM' },

  { code: 'ASM-CHAIN', name: 'Stenter Chain, Pins, Clips & Shoes', type: 'assembly', criticality: 'high' },
  { code: 'CMP-STENTER-CHAIN', name: 'Stenter Chain', type: 'component', parent: 'ASM-CHAIN', criticality: 'high' },
  { code: 'PRT-PINS', name: 'Stenter Pins', type: 'part', parent: 'CMP-STENTER-CHAIN' },
  { code: 'PRT-CLIPS', name: 'Stenter Clips', type: 'part', parent: 'CMP-STENTER-CHAIN' },
  { code: 'PRT-SHOES', name: 'Outfeed Chain Shoes', type: 'part', parent: 'CMP-STENTER-CHAIN' },
  { code: 'PRT-CHAIN-COVER', name: 'Stenter Chain Cover', type: 'part', parent: 'CMP-STENTER-CHAIN' },
  { code: 'CMP-BATCH-ARM', name: 'Batching Arm', type: 'component', parent: 'ASM-CHAIN' },
  { code: 'PRT-BATCH-CHAIN', name: 'Batching Arm Chain', type: 'part', parent: 'CMP-BATCH-ARM' },

  { code: 'ASM-MANGLE', name: 'Mangle & Squeezing System', type: 'assembly', criticality: 'high' },
  { code: 'CMP-MANGLE', name: 'Stenter Mangle', type: 'component', parent: 'ASM-MANGLE', criticality: 'high' },

  { code: 'ASM-DRY', name: 'Drying Fans & Air Circulation', type: 'assembly', criticality: 'high' },
  { code: 'CMP-FAN1', name: 'Fan 1', type: 'component', parent: 'ASM-DRY' },
  { code: 'CMP-FAN2', name: 'Fan 2', type: 'component', parent: 'ASM-DRY' },
  { code: 'PRT-FAN-CHAIN', name: 'Fan Chain', type: 'part', parent: 'ASM-DRY' },

  { code: 'ASM-DRIVE', name: 'Main Drive & Mechanical Motion', type: 'assembly', criticality: 'high' },
  { code: 'CMP-MAIN-DRIVE', name: 'Main Drive', type: 'component', parent: 'ASM-DRIVE', criticality: 'high' },
  { code: 'PRT-DRIVE-SHAFT', name: 'Main Drive Shaft', type: 'part', parent: 'CMP-MAIN-DRIVE' },
  { code: 'PRT-DRIVE-CHAIN', name: 'Main Drive Shaft Chain', type: 'part', parent: 'CMP-MAIN-DRIVE' },
  { code: 'PRT-BEARING', name: 'Machine Bearings', type: 'part', parent: 'ASM-DRIVE' },
  { code: 'CMP-LIFTER', name: 'Machine Lifter', type: 'component', parent: 'ASM-DRIVE' },
  { code: 'CMP-SCROLL', name: 'Scroll Roller', type: 'component', parent: 'ASM-DRIVE' },
  { code: 'PRT-SCROLL-LEVER', name: 'Scroll Roller Lever', type: 'part', parent: 'CMP-SCROLL' },

  { code: 'ASM-OUT', name: 'Outfeed Bed, Width & Measurement', type: 'assembly', criticality: 'high' },
  { code: 'CMP-OUT-BED', name: 'Outfeed Bed', type: 'component', parent: 'ASM-OUT' },
  { code: 'CMP-BED-WIDTH', name: 'Stenter Bed Width System', type: 'component', parent: 'ASM-OUT' },
  { code: 'INS-YARD', name: 'Yardage Counter', type: 'instrument', parent: 'ASM-OUT' },
  { code: 'INS-SELVEDGE', name: 'Selvedge Sensor', type: 'instrument', parent: 'ASM-OUT' },
  { code: 'CMP-OUT-LIGHT', name: 'Outfeed Lighting', type: 'component', parent: 'ASM-OUT' },

  { code: 'ASM-SEW', name: 'Sewing Station', type: 'assembly', criticality: 'high' },
  { code: 'CMP-SEW', name: 'Pegasus Sewing Machine', type: 'component', parent: 'ASM-SEW' },
  { code: 'PRT-NEEDLE', name: 'Sewing Machine Needle', type: 'part', parent: 'CMP-SEW' },
  { code: 'PRT-SEW-CABLE', name: 'Sewing Machine Cable', type: 'part', parent: 'CMP-SEW' },
  { code: 'PRT-SEW-SOCKET', name: 'Sewing Machine Socket', type: 'part', parent: 'CMP-SEW' },

  { code: 'ASM-UTIL', name: 'Air, Steam & Process Utilities', type: 'assembly', criticality: 'high' },
  { code: 'SUB-AIR', name: 'Pneumatic Air Distribution', type: 'subassembly', parent: 'ASM-UTIL' },
  { code: 'PRT-AIR-HOSE', name: 'Infeed Air Hose', type: 'part', parent: 'SUB-AIR' },
  { code: 'PRT-AIR-LINE', name: 'Air Lines & Fittings', type: 'part', parent: 'SUB-AIR' },
  { code: 'SUB-STEAM', name: 'Steam Distribution', type: 'subassembly', parent: 'ASM-UTIL' },
  { code: 'PRT-STEAM-LINE', name: 'Main Steam Pipe', type: 'part', parent: 'SUB-STEAM' },
  { code: 'PRT-WATER-LINE', name: 'Reuse Water Pipeline', type: 'part', parent: 'ASM-UTIL' },
  { code: 'PRT-PROC-VALVE', name: 'Process Valve', type: 'part', parent: 'ASM-UTIL' },

  { code: 'ASM-CTRL', name: 'Electrical Controls & Synchronization', type: 'assembly', criticality: 'high' },
  { code: 'CMP-PANEL', name: 'Stenter 5 Control Panel', type: 'component', parent: 'ASM-CTRL', criticality: 'high' },
  { code: 'CMP-RESET', name: 'Reset Button / Switch', type: 'component', parent: 'CMP-PANEL' },
  { code: 'CMP-SYNC', name: 'Synchronization Control', type: 'component', parent: 'CMP-PANEL' },
  { code: 'CMP-ELEC', name: 'General Electrical System', type: 'component', parent: 'ASM-CTRL' },
];

function full(code: string) { return `${PREFIX}-${code}`; }

async function main() {
  const asset = await db.asset.findUnique({
    where: { assetTag: TAG },
    select: { id: true, assetTag: true, name: true, plantId: true },
  });
  if (!asset) throw new Error('Stenter 5 asset missing');

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
        notes: 'UAT hierarchy derived from GTP Stenter 5 historical maintenance titles. Maintenance-oriented subsystem names are provisional and require OEM/nameplate/master-data verification before production approval.',
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
  const idSet = new Set(rows.map((row) => row.id));
  const roots = rows.filter((row) => !row.parentId);
  const orphans = rows.filter((row) => row.parentId && !idSet.has(row.parentId));

  if (rows.length !== HIERARCHY.length || roots.length !== 10 || orphans.length) {
    throw new Error(`Stenter 5 hierarchy failed nodes=${rows.length} roots=${roots.length} orphans=${orphans.length}`);
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
