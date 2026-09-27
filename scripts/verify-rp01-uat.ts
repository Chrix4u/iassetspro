import { db } from '../src/lib/db';

async function main() {
  const asset = await db.asset.findUnique({
    where: { id: 'uat_asset_rotary_printer_01' },
    select: { id: true, name: true, assetTag: true, plantId: true },
  });
  if (!asset) throw new Error('RP-01 canonical UAT asset is missing');

  const components = await db.componentRegistry.findMany({
    where: { assetId: asset.id },
    select: { id: true, parentId: true, componentCode: true, componentType: true },
  });
  const roots = components.filter((item) => !item.parentId);
  const componentIds = new Set(components.map((item) => item.id));

  const brokenParents = components.filter((item) => item.parentId && !componentIds.has(item.parentId));
  if (brokenParents.length) {
    throw new Error(`RP-01 hierarchy contains ${brokenParents.length} orphan parent link(s)`);
  }
  if (components.length < 77) throw new Error(`Expected at least 77 RP-01 nodes, found ${components.length}`);
  if (roots.length < 8) throw new Error(`Expected at least 8 RP-01 root assemblies, found ${roots.length}`);

  for (const requiredCode of [
    'RP01-ASM-PRINT', 'RP01-ASM-WEB', 'RP01-ASM-DRIVE', 'RP01-ASM-INK',
    'RP01-ASM-DRYER', 'RP01-ASM-CTRL', 'RP01-ASM-PNEU', 'RP01-ASM-SAFETY',
    'RP01-PRT-BRG-DS', 'RP01-PRT-MTRBRG-DE', 'RP01-PRT-EXFBRG',
  ]) {
    if (!components.some((item) => item.componentCode === requiredCode)) {
      throw new Error(`Required RP-01 node missing: ${requiredCode}`);
    }
  }

  const pm = await db.pmSchedule.findUnique({
    where: { id: 'uat_pm_bearing_500h' },
    select: { id: true, componentId: true, frequencyType: true, frequencyValue: true, autoGenerateWO: true },
  });
  if (!pm) throw new Error('Canonical RP-01 500-hour PM is missing');
  if (
    pm.componentId !== 'uat_part_bearing_ds'
    || pm.frequencyType !== 'meter_based'
    || pm.frequencyValue !== 500
    || !pm.autoGenerateWO
  ) throw new Error('Canonical RP-01 PM configuration is incorrect');

  const inventoryCodes = [
    'BRG-SKF-22218-E', 'LUB-EP2-400G', 'BRG-SKF-6316-C3',
    'BRG-SKF-NU316-ECP', 'BRG-SKF-22220-E', 'BRG-SKF-6309-2RS',
    'FLT-F7-600', 'KIT-GRACO-1050-PTFE', 'FLT-FESTO-MS6',
    'ELC-XB5-AS844', 'CPL-KTR-GS19', 'BRG-SKF-22216-E',
  ];
  const inventory = await db.inventoryItem.findMany({
    where: { itemCode: { in: inventoryCodes } },
    select: { itemCode: true, currentStock: true },
  });
  if (inventory.length !== inventoryCodes.length) {
    throw new Error(`Expected ${inventoryCodes.length} RP-01 UAT inventory items, found ${inventory.length}`);
  }

  const spareLinks = await db.componentSparePart.count({ where: { id: { startsWith: 'uat_csp_' } } });
  const toolLinks = await db.componentToolRequirement.count({ where: { id: { startsWith: 'uat_ctr_' } } });
  if (spareLinks < 11) throw new Error(`Expected at least 11 UAT spare links, found ${spareLinks}`);
  if (toolLinks < 8) throw new Error(`Expected at least 8 UAT tool links, found ${toolLinks}`);

  const visualCount = await db.componentVisual.count({
    where: { OR: [{ assetId: asset.id }, { componentId: { in: [...componentIds] } }] },
  });
  const aiConfig = await db.aiConfig.findFirst({
    where: { isActive: true },
    select: { provider: true, imageModel: true, imageApiKey: true, llmApiKey: true },
  });
  const aiImageReady = Boolean(aiConfig && (aiConfig.imageApiKey || aiConfig.llmApiKey));

  console.log(JSON.stringify({
    ready: true,
    asset,
    hierarchy: { nodes: components.length, rootAssemblies: roots.length, orphanParents: brokenParents.length },
    maintenance: { canonicalPm: pm, spareLinks, toolLinks },
    inventory: { expectedItems: inventoryCodes.length, foundItems: inventory.length, stocked: inventory },
    visuals: { persistedVisuals: visualCount, aiImageReady, provider: aiConfig?.provider || null, imageModel: aiConfig?.imageModel || null },
  }, null, 2));
}

main().then(() => process.exit(0)).catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
