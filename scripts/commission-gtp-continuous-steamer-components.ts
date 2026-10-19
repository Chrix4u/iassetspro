import { PrismaClient } from '@prisma/client';
if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) throw new Error('DATABASE_URL must point to PostgreSQL');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db = new PrismaClient({ adapter: createAdapter(process.env.DATABASE_URL) });

const TAG = 'UAT-GTP-333-1-005';
const PREFIX = 'GTP-CST';

type NodeSpec = {
  code: string;
  name: string;
  type: 'assembly' | 'subassembly' | 'component' | 'part' | 'instrument';
  parent?: string;
  criticality?: string;
};

const HIERARCHY: NodeSpec[] = [
  { code: 'ASM-INFEED', name: 'Infeed, Guiding & Cloth Rollover Path', type: 'assembly', criticality: 'high' },
  { code: 'CMP-INFEED', name: 'Infeed Mechanism', type: 'component', parent: 'ASM-INFEED', criticality: 'high' },
  { code: 'CMP-ROLLOVER', name: 'Cloth Rollover / Transfer Path', type: 'component', parent: 'ASM-INFEED', criticality: 'high' },
  { code: 'CMP-GUIDER', name: 'Foxwell Cloth Guider', type: 'component', parent: 'ASM-INFEED' },
  { code: 'CMP-DRAW-ROLLER', name: 'Infeed Cloth Drawn Roller', type: 'component', parent: 'ASM-INFEED' },
  { code: 'PRT-DRAW-BEAR', name: 'Infeed Draw Roller Bearing', type: 'part', parent: 'CMP-DRAW-ROLLER' },
  { code: 'PRT-GRIP-TAPE', name: 'Cloth Grip Tape', type: 'part', parent: 'CMP-ROLLOVER' },
  { code: 'PRT-INFEED-CHAIN', name: 'Infeed Chain', type: 'part', parent: 'CMP-INFEED' },

  { code: 'ASM-CHAIN', name: 'Main Chain, Sprockets & Tensioning', type: 'assembly', criticality: 'high' },
  { code: 'SUB-MAIN-CHAIN', name: 'Main / Inside Chain System', type: 'subassembly', parent: 'ASM-CHAIN' },
  { code: 'PRT-INSIDE-CHAIN', name: 'Inside Chain', type: 'part', parent: 'SUB-MAIN-CHAIN' },
  { code: 'PRT-TENSION-SPROCKET', name: 'Chain Tension Sprocket', type: 'part', parent: 'SUB-MAIN-CHAIN' },
  { code: 'PRT-CHAIN-SPROCKET', name: 'Chain Drive Sprocket', type: 'part', parent: 'SUB-MAIN-CHAIN' },

  { code: 'ASM-CYL', name: 'Cylinder & Drying Roller Train', type: 'assembly', criticality: 'high' },
  { code: 'CMP-CYL2', name: 'Cylinder / Dry Cylinder 2', type: 'component', parent: 'ASM-CYL' },
  { code: 'PRT-CYL2-SHAFT', name: 'Cylinder 2 End Shaft', type: 'part', parent: 'CMP-CYL2' },
  { code: 'PRT-CYL-NUB', name: 'Cylinder Nub / Fitting', type: 'part', parent: 'ASM-CYL' },
  { code: 'PRT-CYL-GRIP', name: 'Dry Cylinder 2 Grip Tape', type: 'part', parent: 'CMP-CYL2' },

  { code: 'ASM-UTIL', name: 'Steam, Condensate, Water & Air Utilities', type: 'assembly', criticality: 'high' },
  { code: 'SUB-STEAM', name: 'Steam Distribution', type: 'subassembly', parent: 'ASM-UTIL', criticality: 'high' },
  { code: 'CMP-STEAM-TANK', name: 'Stainless Steam Tank', type: 'component', parent: 'SUB-STEAM' },
  { code: 'PRT-STEAM-LINE', name: 'Steam Lines & Pipework', type: 'part', parent: 'SUB-STEAM' },
  { code: 'PRT-ALIZARINE', name: 'Alizarine Steam Connection', type: 'part', parent: 'SUB-STEAM' },
  { code: 'PRT-LAGGING', name: 'Steam / Thermal Lagging', type: 'part', parent: 'SUB-STEAM' },
  { code: 'PRT-CONDENSATE', name: 'Condensate Path & Side-Cover Area', type: 'part', parent: 'SUB-STEAM' },
  { code: 'PRT-WATER-LINE', name: 'Chamber Water Pipeline', type: 'part', parent: 'ASM-UTIL' },
  { code: 'SUB-AIR', name: 'Pneumatic Air Distribution', type: 'subassembly', parent: 'ASM-UTIL' },
  { code: 'PRT-AIR-TUBE', name: 'Flexible Air Tube', type: 'part', parent: 'SUB-AIR' },
  { code: 'PRT-AIR-LINE', name: 'Air Lines & Fittings', type: 'part', parent: 'SUB-AIR' },

  { code: 'ASM-OUT', name: 'Plaiter & Outfeed System', type: 'assembly', criticality: 'high' },
  { code: 'CMP-PLAIT1', name: 'Plaiter 1', type: 'component', parent: 'ASM-OUT' },
  { code: 'PRT-PLAIT1-ARM', name: 'Plaiter 1 Arm', type: 'part', parent: 'CMP-PLAIT1' },
  { code: 'PRT-PLAIT1-STUD', name: 'Plaiter 1 Arm Stud', type: 'part', parent: 'CMP-PLAIT1' },
  { code: 'CMP-PLAIT2', name: 'Plaiter 2', type: 'component', parent: 'ASM-OUT' },
  { code: 'CMP-PLAIT9', name: 'Plaiter 9', type: 'component', parent: 'ASM-OUT' },

  { code: 'ASM-SEW', name: 'Sewing & Cloth Joining Station', type: 'assembly', criticality: 'high' },
  { code: 'CMP-SEW', name: 'Sewing Machine', type: 'component', parent: 'ASM-SEW' },
  { code: 'PRT-NEEDLE', name: 'Sewing / Machine Needle', type: 'part', parent: 'CMP-SEW' },
  { code: 'PRT-SEW-CABLE', name: 'Sewing Machine Live Cable', type: 'part', parent: 'CMP-SEW' },

  { code: 'ASM-DRIVE', name: 'Main & Infeed Drive System', type: 'assembly', criticality: 'high' },
  { code: 'CMP-MAIN-DRIVE', name: 'Main Machine Drive', type: 'component', parent: 'ASM-DRIVE', criticality: 'high' },
  { code: 'CMP-INFEED-DRIVE', name: 'Infeed Drive', type: 'component', parent: 'ASM-DRIVE' },
  { code: 'PRT-DRIVE-BELT', name: 'Drive Belt', type: 'part', parent: 'CMP-MAIN-DRIVE' },

  { code: 'ASM-CTRL', name: 'Electrical Controls & Steam Indication', type: 'assembly', criticality: 'high' },
  { code: 'CMP-MAIN-PANEL', name: 'Main Electrical Panel', type: 'component', parent: 'ASM-CTRL', criticality: 'high' },
  { code: 'CMP-RESET', name: 'Machine Reset Control', type: 'component', parent: 'ASM-CTRL' },
  { code: 'CMP-ELEC', name: 'General Electrical Control System', type: 'component', parent: 'ASM-CTRL' },
  { code: 'INS-STEAM-LIGHT', name: 'Steam Indicating Light', type: 'instrument', parent: 'ASM-CTRL' },
  { code: 'INS-STEAM-IND', name: 'Steam Indicator', type: 'instrument', parent: 'ASM-CTRL' },

  { code: 'ASM-SAFE', name: 'Emergency & Fire Safety System', type: 'assembly', criticality: 'critical' },
  { code: 'CMP-ESTOP', name: 'Emergency Switch', type: 'component', parent: 'ASM-SAFE', criticality: 'critical' },
  { code: 'CMP-EXTING', name: 'Fire Extinguisher Station', type: 'component', parent: 'ASM-SAFE', criticality: 'critical' },
  { code: 'PRT-EXT-HOOK', name: 'Fire Extinguisher Hook / Mount', type: 'part', parent: 'CMP-EXTING' },
];

function full(code: string) { return `${PREFIX}-${code}`; }

async function main() {
  const asset = await db.asset.findUnique({
    where: { assetTag: TAG },
    select: { id: true, assetTag: true, name: true, plantId: true },
  });
  if (!asset) throw new Error('Continuous Steamer asset missing');

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
        notes: 'UAT hierarchy derived from GTP Continuous Steamer historical maintenance titles. Maintenance-oriented subsystem names are provisional and require OEM/nameplate/master-data verification before production approval.',
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
  if (rows.length !== HIERARCHY.length || roots.length !== 9 || orphans.length) {
    throw new Error(`Continuous Steamer hierarchy failed nodes=${rows.length} roots=${roots.length} orphans=${orphans.length}`);
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
