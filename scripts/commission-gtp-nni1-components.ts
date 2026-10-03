import { PrismaClient } from '@prisma/client';
if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) throw new Error('DATABASE_URL must point to PostgreSQL');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db = new PrismaClient({ adapter: createAdapter(process.env.DATABASE_URL) });

const TAG = 'UAT-GTP-372-1-039';
const PREFIX = 'GTP-NNI1';

type NodeSpec = {
  code: string;
  name: string;
  type: 'assembly' | 'subassembly' | 'component' | 'part' | 'instrument';
  parent?: string;
  criticality?: string;
};

const HIERARCHY: NodeSpec[] = [
  { code: 'ASM-WEB', name: 'Infeed, Outfeed & Cloth Handling', type: 'assembly', criticality: 'high' },
  { code: 'CMP-GUIDER', name: 'Foxwell Cloth Guider', type: 'component', parent: 'ASM-WEB' },
  { code: 'CMP-IN-COMP', name: 'Infeed Compensator', type: 'component', parent: 'ASM-WEB' },
  { code: 'CMP-OUT-COMP', name: 'Outfeed Compensator', type: 'component', parent: 'ASM-WEB' },
  { code: 'CMP-CHEM-TROUGH', name: 'Chemical Trough / Cloth Path', type: 'component', parent: 'ASM-WEB' },
  { code: 'CMP-SEW', name: 'Sewing Machine', type: 'component', parent: 'ASM-WEB' },
  { code: 'PRT-NEEDLE', name: 'Sewing Machine Needle', type: 'part', parent: 'CMP-SEW' },

  { code: 'ASM-CHEM', name: 'Fixation & Colour Pumping System', type: 'assembly', criticality: 'high' },
  { code: 'CMP-FIX-PUMP', name: 'Fixation Pump', type: 'component', parent: 'ASM-CHEM', criticality: 'high' },
  { code: 'CMP-CHEM-PUMP', name: 'Chemical Pump', type: 'component', parent: 'ASM-CHEM' },
  { code: 'CMP-COLOUR-PUMP', name: 'Colour Pump', type: 'component', parent: 'ASM-CHEM' },
  { code: 'CMP-COLOUR-MOTOR', name: 'Colour Pumping Motor', type: 'component', parent: 'CMP-COLOUR-PUMP' },
  { code: 'CMP-COLOUR-BOX', name: 'Colour Box', type: 'component', parent: 'ASM-CHEM' },

  { code: 'ASM-MANGLE', name: 'Fixation & Outfeed Mangle System', type: 'assembly', criticality: 'high' },
  { code: 'CMP-FIX-MANGLE', name: 'Fixation Mangle', type: 'component', parent: 'ASM-MANGLE', criticality: 'high' },
  { code: 'CMP-OUT-MANGLE', name: 'Outfeed Mangle', type: 'component', parent: 'ASM-MANGLE' },

  { code: 'ASM-STEAM', name: 'Steam, Condensate & Heat Exchange', type: 'assembly', criticality: 'high' },
  { code: 'SUB-STEAM', name: 'Steam Distribution', type: 'subassembly', parent: 'ASM-STEAM', criticality: 'high' },
  { code: 'PRT-STEAM-LINE', name: 'Steam Lines', type: 'part', parent: 'SUB-STEAM' },
  { code: 'PRT-STEAM-TRAP', name: 'Steam Traps', type: 'part', parent: 'SUB-STEAM' },
  { code: 'PRT-STEAM-VALVE', name: 'Steam Valve', type: 'part', parent: 'SUB-STEAM' },
  { code: 'CMP-EXCHANGER', name: 'Steam Exchanger', type: 'component', parent: 'ASM-STEAM' },
  { code: 'CMP-SAMPLE-CHAMBER', name: 'Sample Chamber Steam Circuit', type: 'component', parent: 'ASM-STEAM' },

  { code: 'ASM-DRY', name: 'Drying Cylinder, Oven & Circulation', type: 'assembly', criticality: 'high' },
  { code: 'CMP-DRY-CYL', name: 'Drying Cylinder', type: 'component', parent: 'ASM-DRY' },
  { code: 'CMP-CIRC-FAN', name: 'Circulation Fan', type: 'component', parent: 'ASM-DRY' },
  { code: 'CMP-OVEN', name: 'Oven / Heated Chamber', type: 'component', parent: 'ASM-DRY' },
  { code: 'PRT-OVEN-DOOR', name: 'Oven Chamber Doors', type: 'part', parent: 'CMP-OVEN' },
  { code: 'PRT-DOOR-LOCK', name: 'Chamber Door Locking Device', type: 'part', parent: 'CMP-OVEN' },

  { code: 'ASM-PNEU', name: 'Pneumatic Air System', type: 'assembly', criticality: 'high' },
  { code: 'SUB-AIR', name: 'Compressed Air Distribution', type: 'subassembly', parent: 'ASM-PNEU' },
  { code: 'PRT-AIR-LINE', name: 'Air Lines & Fittings', type: 'part', parent: 'SUB-AIR' },

  { code: 'ASM-DRIVE', name: 'Mechanical Drive & Bearings', type: 'assembly', criticality: 'high' },
  { code: 'CMP-MOTOR', name: 'Machine / Pump Drive Motor', type: 'component', parent: 'ASM-DRIVE' },
  { code: 'PRT-BEARING', name: 'Machine Bearing', type: 'part', parent: 'ASM-DRIVE' },
  { code: 'PRT-MOTOR-FAN', name: 'Motor Fan Cover / Plate', type: 'part', parent: 'CMP-MOTOR' },

  { code: 'ASM-CTRL', name: 'Electrical Panels, Controls & Lighting', type: 'assembly', criticality: 'high' },
  { code: 'CMP-PANEL', name: 'Electrical Control Panel', type: 'component', parent: 'ASM-CTRL', criticality: 'high' },
  { code: 'CMP-ELEC', name: 'General Electrical System', type: 'component', parent: 'ASM-CTRL' },
  { code: 'CMP-LIGHT', name: 'Machine Lighting System', type: 'component', parent: 'ASM-CTRL' },
  { code: 'PRT-LIGHT-SW', name: 'Lighting Switch', type: 'part', parent: 'CMP-LIGHT' },
];

function full(code: string) { return `${PREFIX}-${code}`; }

async function main() {
  const asset = await db.asset.findUnique({
    where: { assetTag: TAG },
    select: { id: true, assetTag: true, name: true, plantId: true },
  });
  if (!asset) throw new Error('NNI Machine 1 asset missing');

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
        notes: 'UAT hierarchy derived from GTP NNI Machine 1 historical maintenance titles. Maintenance-oriented subsystem names are provisional and require OEM/nameplate/master-data verification before production approval.',
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

  if (rows.length !== HIERARCHY.length || roots.length !== 8 || orphans.length) {
    throw new Error(`NNI hierarchy failed nodes=${rows.length} roots=${roots.length} orphans=${orphans.length}`);
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
