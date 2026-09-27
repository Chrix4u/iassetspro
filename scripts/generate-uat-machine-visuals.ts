import fs from 'node:fs';
import path from 'node:path';
import { db } from '@/lib/db';
import { aiImageGeneration } from '@/lib/ai-client';

type Target = {
  assetId: string;
  componentId: string | null;
  name: string;
  code: string;
  componentType: string;
  description: string;
  specification: string;
  zoomLevel: number;
};

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 72);
}

async function generatePng(prompt: string, filename: string): Promise<string> {
  const response = await aiImageGeneration({ prompt, size: '1024x1024' });
  const base64 = response.data?.[0]?.base64;
  const remoteUrl = response.data?.[0]?.url;
  const outDir = path.join(process.cwd(), 'public', 'generated-assets', 'component-visuals');
  fs.mkdirSync(outDir, { recursive: true });
  const filePath = path.join(outDir, filename);

  if (base64) {
    fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
  } else if (remoteUrl) {
    const res = await fetch(remoteUrl);
    if (!res.ok) throw new Error('Image download failed: ' + res.status);
    fs.writeFileSync(filePath, Buffer.from(await res.arrayBuffer()));
  } else {
    throw new Error('AI provider returned no image');
  }

  return '/generated-assets/component-visuals/' + filename;
}

async function main() {
  const asset = await db.asset.findUnique({
    where: { assetTag: 'UAT-RP-001' },
    select: {
      id: true, name: true, assetTag: true, description: true, specification: true,
      manufacturer: true, model: true,
    },
  });
  if (!asset) throw new Error('UAT asset UAT-RP-001 was not found');

  const admin = await db.user.findFirst({ where: { username: 'admin' }, select: { id: true } });
  if (!admin) throw new Error('Admin user was not found');

  const components = await db.componentRegistry.findMany({
    where: { assetId: asset.id },
    orderBy: { sortOrder: 'asc' },
    select: {
      id: true, name: true, componentCode: true, componentType: true,
      description: true, specification: true,
    },
  });

  const targets: Target[] = [{
    assetId: asset.id,
    componentId: null,
    name: asset.name,
    code: asset.assetTag,
    componentType: 'machine',
    description: asset.description || '',
    specification: asset.specification || '{}',
    zoomLevel: 0,
  }, ...components.map((component) => ({
    assetId: asset.id,
    componentId: component.id,
    name: component.name,
    code: component.componentCode,
    componentType: component.componentType,
    description: component.description || '',
    specification: component.specification || '{}',
    zoomLevel: component.componentType === 'assembly' ? 1
      : component.componentType === 'subassembly' ? 2
        : component.componentType === 'component' ? 3 : 4,
  }))];

  const visualTypes = ['ai_realistic', 'technical_2d'] as const;
  for (const target of targets) {
    for (const visualType of visualTypes) {
      const prompt = visualType === 'technical_2d'
        ? 'Precise orthographic 2D engineering illustration of ' + target.name
          + ' (' + target.code + '), part of ' + asset.name + '. '
          + target.description + ' Technical context: ' + target.specification
          + '. Show mechanically credible geometry, clean linework, section/detail cues where helpful, '
          + 'white or very light blueprint background, no dimensions, no labels, no logos, no watermark.'
        : 'Photorealistic industrial engineering render of ' + target.name
          + ' (' + target.code + '), part of ' + asset.name + '. '
          + target.description + ' Technical context: ' + target.specification
          + '. Show the selected ' + target.componentType
          + ' prominently with mechanically credible geometry and realistic materials. '
          + 'Neutral workshop or studio background, no people, no labels, no logos, no watermarks.';

      const filename = slug(asset.assetTag) + '-' + slug(target.code)
        + (visualType === 'technical_2d' ? '-technical-2d.png' : '-realistic.png');
      const imageUrl = await generatePng(prompt, filename);

      await db.componentVisual.updateMany({
        where: {
          visualType,
          isPrimary: true,
          ...(target.componentId ? { componentId: target.componentId } : { assetId: asset.id, componentId: null }),
        },
        data: { isPrimary: false },
      });

      await db.componentVisual.create({
        data: {
          assetId: asset.id,
          componentId: target.componentId,
          visualType,
          title: target.name + (visualType === 'technical_2d' ? ' — engineering 2D' : ' — AI realistic'),
          description: 'Commissioning visual for the clean RP-01 UAT hierarchy.',
          imageUrl,
          thumbnailUrl: imageUrl,
          sourceProvider: 'configured_ai',
          sourcePrompt: prompt,
          zoomLevel: target.zoomLevel,
          sortOrder: target.zoomLevel,
          isPrimary: true,
          generatedAt: new Date(),
          createdById: admin.id,
        },
      });
      console.log('Generated', target.code, visualType, imageUrl);
    }
  }

  const explodeTargets = targets.filter((target) => target.zoomLevel >= 3);
  for (const target of explodeTargets) {
    const prompt = 'Exploded-view industrial engineering render of ' + target.name
      + ' (' + target.code + ') from ' + asset.name
      + '. Separate serviceable parts along assembly axes, expose fits, bearing seats and fasteners, '
      + 'realistic metal and elastomer materials, neutral studio background, no text, no people, no watermark. '
      + 'Technical context: ' + target.specification;
    const filename = slug(asset.assetTag) + '-' + slug(target.code) + '-exploded.png';
    const imageUrl = await generatePng(prompt, filename);

    await db.componentVisual.updateMany({
      where: { componentId: target.componentId!, visualType: 'exploded', isPrimary: true },
      data: { isPrimary: false },
    });
    await db.componentVisual.create({
      data: {
        assetId: asset.id,
        componentId: target.componentId,
        visualType: 'exploded',
        title: target.name + ' — exploded view',
        description: 'Exploded service view for RP-01 commissioning.',
        imageUrl,
        thumbnailUrl: imageUrl,
        sourceProvider: 'configured_ai',
        sourcePrompt: prompt,
        zoomLevel: target.zoomLevel,
        sortOrder: target.zoomLevel,
        isPrimary: true,
        generatedAt: new Date(),
        createdById: admin.id,
      },
    });
    console.log('Generated', target.code, 'exploded', imageUrl);
  }

  console.log(
    'RP-01 visual commissioning complete:',
    targets.length, 'realistic targets,',
    targets.length, 'engineering 2D targets,',
    explodeTargets.length, 'exploded targets',
  );
}

main().finally(async () => db.$disconnect());
