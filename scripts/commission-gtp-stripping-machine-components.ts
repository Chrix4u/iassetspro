import { PrismaClient } from '@prisma/client';
if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) throw new Error('DATABASE_URL must point to PostgreSQL');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db = new PrismaClient({ adapter: createAdapter(process.env.DATABASE_URL) });

const TAG = 'UAT-GTP-802-1-045';
const PREFIX = 'GTP-STRIP';

type NodeSpec = {
  code: string;
  name: string;
  type: 'assembly' | 'subassembly' | 'component' | 'part' | 'instrument';
  parent?: string;
  criticality?: string;
};

const HIERARCHY: NodeSpec[] = [
  { code: 'ASM-PNEU', name: 'Pneumatic & Support Cylinder System', type: 'assembly', criticality: 'high' },
  { code: 'SUB-AIR', name: 'Compressed Air Distribution', type: 'subassembly', parent: 'ASM-PNEU', criticality: 'high' },
  { code: 'PRT-AIR-HOSE', name: 'Air Hose / Tube', type: 'part', parent: 'SUB-AIR' },
  { code: 'PRT-AIR-CONN', name: 'Air Connectors & Fittings', type: 'part', parent: 'SUB-AIR' },
  { code: 'CMP-SUPPORT-CYL', name: 'Support Cylinder', type: 'component', parent: 'ASM-PNEU', criticality: 'high' },
  { code: 'CMP-PRESS-ACT', name: 'Pressure Movement / Actuation System', type: 'component', parent: 'ASM-PNEU' },

  { code: 'ASM-WATER', name: 'High-Pressure Water & Stripping Circuit', type: 'assembly', criticality: 'high' },
  { code: 'CMP-HP-WATER', name: 'High-Pressure Water Circuit', type: 'component', parent: 'ASM-WATER', criticality: 'high' },
  { code: 'PRT-WATER-HOSE', name: 'High-Pressure Water Hose', type: 'part', parent: 'CMP-HP-WATER' },
  { code: 'PRT-WATER-PIPE', name: 'Water Pipeline', type: 'part', parent: 'ASM-WATER' },
  { code: 'PRT-WATER-JOINT', name: 'Water Joints / Leak Points', type: 'part', parent: 'ASM-WATER' },
  { code: 'CMP-NOZZLE-BAR', name: 'Nozzle Bar', type: 'component', parent: 'ASM-WATER' },
  { code: 'PRT-NOZZLE-STOP', name: 'Nozzle Bar Stopper', type: 'part', parent: 'CMP-NOZZLE-BAR' },
  { code: 'CMP-WATER-HOLES', name: 'Stripping Water Outlet / Hole Circuit', type: 'component', parent: 'ASM-WATER' },

  { code: 'ASM-OIL', name: 'Oil & Pressure System', type: 'assembly', criticality: 'high' },
  { code: 'CMP-OIL-TANK', name: 'Nova Jet Oil Tank', type: 'component', parent: 'ASM-OIL' },
  { code: 'PRT-OIL-LINE', name: 'Oil Lines & Leak Points', type: 'part', parent: 'ASM-OIL' },
  { code: 'CMP-PRESSURE', name: 'Process Pressure System', type: 'component', parent: 'ASM-OIL', criticality: 'high' },

  { code: 'ASM-CHILL', name: 'Chiller & Cooling System', type: 'assembly', criticality: 'high' },
  { code: 'CMP-CHILLER', name: 'Process Chiller', type: 'component', parent: 'ASM-CHILL', criticality: 'high' },
  { code: 'CMP-CHILL-MOTOR', name: 'Chiller Motor', type: 'component', parent: 'CMP-CHILLER' },
  { code: 'CMP-CHILL-PANEL', name: 'Chiller Control Panel', type: 'component', parent: 'CMP-CHILLER' },
  { code: 'INS-CHILL-DISPLAY', name: 'Chiller Display Unit', type: 'instrument', parent: 'CMP-CHILL-PANEL' },

  { code: 'ASM-PROC', name: 'Screen Treatment & Stripping Hardware', type: 'assembly', criticality: 'high' },
  { code: 'CMP-TREAT-TANK', name: 'Screen Treatment Tank', type: 'component', parent: 'ASM-PROC' },
  { code: 'PRT-TANK-BAR', name: 'Screen Treatment Tank Bar', type: 'part', parent: 'CMP-TREAT-TANK' },
  { code: 'CMP-STRIP-MECH', name: 'Stripping Process Mechanism', type: 'component', parent: 'ASM-PROC' },

  { code: 'ASM-DRIVE', name: 'Drive & Mechanical System', type: 'assembly', criticality: 'high' },
  { code: 'CMP-MOTOR', name: 'Main Drive Motor', type: 'component', parent: 'ASM-DRIVE' },
  { code: 'PRT-MOTOR-BELT', name: 'Motor Belt', type: 'part', parent: 'CMP-MOTOR' },
  { code: 'PRT-BEARING', name: 'Drive Bearings', type: 'part', parent: 'ASM-DRIVE' },
  { code: 'CMP-MOTION', name: 'Machine Movement System', type: 'component', parent: 'ASM-DRIVE' },

  { code: 'ASM-CTRL', name: 'Electrical Controls, HMI & Indication', type: 'assembly', criticality: 'high' },
  { code: 'CMP-PANEL', name: 'Main Control Panel', type: 'component', parent: 'ASM-CTRL', criticality: 'high' },
  { code: 'CMP-START', name: 'Start Pushbutton', type: 'component', parent: 'CMP-PANEL' },
  { code: 'CMP-RESET', name: 'Reset Pushbutton', type: 'component', parent: 'CMP-PANEL' },
  { code: 'CMP-SOCKET', name: 'Electrical Socket', type: 'component', parent: 'ASM-CTRL' },
  { code: 'CMP-LIGHT', name: 'Machine Indicator / Lighting', type: 'component', parent: 'ASM-CTRL' },
  { code: 'CMP-POWER', name: 'Machine Power Supply', type: 'component', parent: 'ASM-CTRL', criticality: 'high' },
  { code: 'INS-PRESSURE', name: 'Pressure Indication / Monitoring', type: 'instrument', parent: 'ASM-CTRL' },
  { code: 'INS-SUPPORT-ALARM', name: 'Support Cylinder Alarm', type: 'instrument', parent: 'ASM-CTRL' },
];

function full(code: string) { return `${PREFIX}-${code}`; }

async function main() {
  const asset = await db.asset.findUnique({
    where: { assetTag: TAG },
    select: { id: true, assetTag: true, name: true, plantId: true },
  });
  if (!asset) throw new Error('Stripping Machine asset missing');

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
        notes: 'UAT hierarchy derived from GTP Stripping Machine historical maintenance titles (JD / Nova Jet 3000 terminology). Maintenance-oriented subsystem names are provisional and require OEM/nameplate/master-data verification before production approval.',
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

  if (rows.length !== HIERARCHY.length || roots.length !== 7 || orphans.length) {
    throw new Error(`Stripping Machine hierarchy failed nodes=${rows.length} roots=${roots.length} orphans=${orphans.length}`);
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
