import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) {
  throw new Error('DATABASE_URL must point to PostgreSQL');
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db = new PrismaClient({ adapter: createAdapter(process.env.DATABASE_URL) });

const TARGET_ASSET_TAG = 'UAT-GTP-309-2-002';
const PREFIX = 'GTP-RS2';

type NodeSpec = {
  code: string;
  name: string;
  type: 'assembly' | 'subassembly' | 'component' | 'part' | 'instrument';
  parent?: string;
  criticality?: string;
};

const HIERARCHY: NodeSpec[] = [
  { code: 'ASM-INFEED', name: 'Infeed, Bow, Scutcher & Cloth Handling', type: 'assembly', criticality: 'high' },
  { code: 'CMP-BOW', name: 'Bow / Cloth Opening Unit', type: 'component', parent: 'ASM-INFEED' },
  { code: 'SUB-SCUTCHER', name: 'Scutcher System', type: 'subassembly', parent: 'ASM-INFEED', criticality: 'high' },
  { code: 'CMP-SCUTCHER', name: 'Scutcher Assembly', type: 'component', parent: 'SUB-SCUTCHER', criticality: 'high' },
  { code: 'PRT-SCUTCHER-BELT', name: 'Scutcher Belt', type: 'part', parent: 'SUB-SCUTCHER' },
  { code: 'CMP-SPIRAL-ROLLER', name: 'Spiral Roller', type: 'component', parent: 'ASM-INFEED' },
  { code: 'CMP-BASKET-ROLLER', name: 'Basket Roller / Stand', type: 'component', parent: 'ASM-INFEED' },
  { code: 'CMP-CLOTH-HANDLING', name: 'Cloth Guide / Separation Hardware', type: 'component', parent: 'ASM-INFEED' },

  { code: 'ASM-COMPARTMENTS', name: 'Process Compartments 1–6', type: 'assembly', criticality: 'critical' },
  { code: 'SUB-COMP-1', name: 'Process Compartment 1', type: 'subassembly', parent: 'ASM-COMPARTMENTS', criticality: 'high' },
  { code: 'SUB-COMP-2', name: 'Process Compartment 2', type: 'subassembly', parent: 'ASM-COMPARTMENTS', criticality: 'high' },
  { code: 'SUB-COMP-3', name: 'Process Compartment 3', type: 'subassembly', parent: 'ASM-COMPARTMENTS' },
  { code: 'SUB-COMP-4', name: 'Process Compartment 4', type: 'subassembly', parent: 'ASM-COMPARTMENTS' },
  { code: 'SUB-COMP-5', name: 'Process Compartment 5', type: 'subassembly', parent: 'ASM-COMPARTMENTS', criticality: 'high' },
  { code: 'SUB-COMP-6', name: 'Process Compartment 6', type: 'subassembly', parent: 'ASM-COMPARTMENTS', criticality: 'high' },

  { code: 'ASM-MANGLE', name: 'Squeezer, Mangle & Roller Train', type: 'assembly', criticality: 'critical' },
  { code: 'CMP-SQUEEZER', name: 'Squeezer Assembly', type: 'component', parent: 'ASM-MANGLE', criticality: 'critical' },
  { code: 'CMP-MANGLE', name: 'Mangle Assembly', type: 'component', parent: 'ASM-MANGLE', criticality: 'high' },
  { code: 'PRT-PROCESS-ROLLER', name: 'Process / Squeezer Roller', type: 'part', parent: 'ASM-MANGLE', criticality: 'high' },
  { code: 'PRT-SQUEEZER-BEARING', name: 'Squeezer Roller Bearing', type: 'part', parent: 'CMP-SQUEEZER', criticality: 'high' },

  { code: 'ASM-DRIVE', name: 'Chain, Gearbox & Coupling Drive', type: 'assembly', criticality: 'critical' },
  { code: 'SUB-CHAIN', name: 'Chain Drive System', type: 'subassembly', parent: 'ASM-DRIVE', criticality: 'critical' },
  { code: 'PRT-CHAIN', name: 'Drive Chain', type: 'part', parent: 'SUB-CHAIN', criticality: 'critical' },
  { code: 'PRT-CHAIN-GUARD', name: 'Chain Guard', type: 'part', parent: 'SUB-CHAIN' },
  { code: 'CMP-GEARBOX', name: 'Gearbox', type: 'component', parent: 'ASM-DRIVE', criticality: 'high' },
  { code: 'CMP-COUPLING', name: 'Drive Coupling', type: 'component', parent: 'ASM-DRIVE', criticality: 'high' },
  { code: 'CMP-DRIVE-MOTOR', name: 'Drive / Compartment Motor', type: 'component', parent: 'ASM-DRIVE', criticality: 'high' },
  { code: 'PRT-DRIVE-BELT', name: 'Drive / Scutcher Belt', type: 'part', parent: 'ASM-DRIVE' },

  { code: 'ASM-DOSING', name: 'Soap & Chemical Dosing', type: 'assembly', criticality: 'high' },
  { code: 'SUB-DOSING', name: 'Dosing Circuit', type: 'subassembly', parent: 'ASM-DOSING', criticality: 'high' },
  { code: 'CMP-DOSING-PUMP', name: 'Dosing / Process Pump', type: 'component', parent: 'SUB-DOSING', criticality: 'high' },
  { code: 'CMP-DOSING-TANK', name: 'Soap / Dosing Tank', type: 'component', parent: 'SUB-DOSING' },
  { code: 'PRT-DOSING-LINE', name: 'Dosing Pipe / Hose Line', type: 'part', parent: 'SUB-DOSING' },

  { code: 'ASM-PNEU', name: 'Pneumatic & Air System', type: 'assembly', criticality: 'high' },
  { code: 'SUB-AIR', name: 'Compressed Air Distribution', type: 'subassembly', parent: 'ASM-PNEU', criticality: 'high' },
  { code: 'CMP-AIR-CYLINDER', name: 'Pneumatic Cylinder', type: 'component', parent: 'SUB-AIR', criticality: 'high' },
  { code: 'PRT-AIR-LINES', name: 'Air Lines, Fittings & Regulators', type: 'part', parent: 'SUB-AIR' },

  { code: 'ASM-UTIL', name: 'Steam, Drainage & Extraction Utilities', type: 'assembly', criticality: 'high' },
  { code: 'SUB-STEAM', name: 'Steam & Condensate Circuit', type: 'subassembly', parent: 'ASM-UTIL', criticality: 'high' },
  { code: 'PRT-STEAM-LINES', name: 'Steam Lines', type: 'part', parent: 'SUB-STEAM' },
  { code: 'PRT-CONDENSATE-LINES', name: 'Condensate / Utility Pipework', type: 'part', parent: 'SUB-STEAM' },
  { code: 'CMP-BUTTERFLY-VALVE', name: 'Butterfly / Process Valve', type: 'component', parent: 'ASM-UTIL' },
  { code: 'SUB-DRAIN', name: 'Drainage & Gutter System', type: 'subassembly', parent: 'ASM-UTIL' },
  { code: 'PRT-DRAIN-LINE', name: 'Drain Pipe / Gutter', type: 'part', parent: 'SUB-DRAIN' },
  { code: 'CMP-EXTRACTION-FAN', name: 'Extraction Fan', type: 'component', parent: 'ASM-UTIL' },

  { code: 'ASM-CTRL', name: 'Electrical, Controls & Sewing Station', type: 'assembly', criticality: 'high' },
  { code: 'CMP-CONTROL-PANEL', name: 'Electrical / Control Panel', type: 'component', parent: 'ASM-CTRL', criticality: 'high' },
  { code: 'CMP-CONTROL-KNOBS', name: 'Control Knobs & Switchgear', type: 'component', parent: 'ASM-CTRL' },
  { code: 'CMP-LIGHTING', name: 'Machine Lighting & Electrical Outlets', type: 'component', parent: 'ASM-CTRL' },
  { code: 'SUB-SEWING', name: 'Cloth Sewing Station', type: 'subassembly', parent: 'ASM-CTRL', criticality: 'high' },
  { code: 'CMP-SEWING-MACHINE', name: 'Sewing Machine', type: 'component', parent: 'SUB-SEWING', criticality: 'high' },
  { code: 'PRT-SEWING-NEEDLE', name: 'Sewing Machine Needle', type: 'part', parent: 'CMP-SEWING-MACHINE' },
];

function fullCode(code: string) {
  return PREFIX + '-' + code;
}

async function main() {
  const asset = await db.asset.findUnique({
    where: { assetTag: TARGET_ASSET_TAG },
    select: { id: true, assetTag: true, name: true, plantId: true },
  });
  if (!asset) throw new Error(TARGET_ASSET_TAG + ' is missing');

  const idByCode = new Map<string, string>();
  await db.$transaction(async (tx) => {
    for (let index = 0; index < HIERARCHY.length; index += 1) {
      const node = HIERARCHY[index];
      const componentCode = fullCode(node.code);
      const parentId = node.parent ? idByCode.get(node.parent) ?? null : null;
      if (node.parent && !parentId) {
        throw new Error('Parent ' + node.parent + ' not yet commissioned for ' + node.code);
      }

      const notes = [
        'UAT hierarchy derived from GTP Rope Soaper Machine 2 historical maintenance titles.',
        'Subsystem names are maintenance-oriented and must be verified against OEM drawings/nameplates before production master-data approval.',
      ].join(' ');

      const existing = await tx.componentRegistry.findUnique({
        where: { componentCode },
        select: { id: true },
      });

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

  const rows = await db.componentRegistry.findMany({
    where: { assetId: asset.id, componentCode: { startsWith: PREFIX } },
    select: { id: true, parentId: true, componentCode: true },
  });
  const ids = new Set(rows.map((row) => row.id));
  const roots = rows.filter((row) => !row.parentId);
  const orphans = rows.filter((row) => row.parentId && !ids.has(row.parentId));

  if (rows.length !== HIERARCHY.length || roots.length !== 8 || orphans.length !== 0) {
    throw new Error(
      'Rope Soaper 2 hierarchy verification failed: nodes=' + rows.length
      + ' roots=' + roots.length + ' orphans=' + orphans.length,
    );
  }

  console.log(JSON.stringify({
    asset,
    nodes: rows.length,
    roots: roots.length,
    orphans: orphans.length,
    note: 'Hierarchy only. Inventory, tools, PM links and OEM specifications are intentionally not inferred.',
    status: 'PASS',
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(async () => db.$disconnect());
