import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { aiImageGeneration } from '@/lib/ai-client';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';

export const maxDuration = 180;

function safeSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
}

async function saveImage(prompt: string, filename: string): Promise<{ imageUrl: string; provider: string }> {
  const response = await aiImageGeneration({ prompt, size: '1024x1024' });
  const imageBase64 = response.data?.[0]?.base64;
  const remoteUrl = response.data?.[0]?.url;
  const outDir = path.join(process.cwd(), 'public', 'generated-assets', 'component-visuals');
  fs.mkdirSync(outDir, { recursive: true });
  const filePath = path.join(outDir, filename);

  if (imageBase64) {
    fs.writeFileSync(filePath, Buffer.from(imageBase64, 'base64'));
  } else if (remoteUrl) {
    const result = await fetch(remoteUrl);
    if (!result.ok) throw new Error('Generated image download failed (' + result.status + ')');
    fs.writeFileSync(filePath, Buffer.from(await result.arrayBuffer()));
  } else {
    throw new Error('AI provider returned no image data');
  }

  return {
    imageUrl: '/generated-assets/component-visuals/' + filename,
    provider: 'configured_ai',
  };
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    if (!isAdmin(session)
      && !hasPermission(session, 'digital_twin.manage')
      && !hasPermission(session, 'assets.hierarchy')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const assetId = String(body.assetId || '');
    const componentId = body.componentId ? String(body.componentId) : null;
    const visualType = String(body.visualType || 'ai_realistic');

    if (!assetId) {
      return NextResponse.json({ success: false, error: 'assetId is required' }, { status: 400 });
    }

    const asset = await db.asset.findUnique({
      where: { id: assetId },
      select: {
        id: true, name: true, assetTag: true, description: true, manufacturer: true,
        model: true, specification: true, plantId: true,
      },
    });
    if (!asset) return NextResponse.json({ success: false, error: 'Asset not found' }, { status: 404 });

    const plantScope = await getPlantScope(request, session);
    if (!canAccessPlantStrict(plantScope, asset.plantId)) {
      return NextResponse.json({ success: false, error: 'Asset not found or not accessible' }, { status: 404 });
    }

    const component = componentId
      ? await db.componentRegistry.findUnique({
          where: { id: componentId },
          include: { parent: { select: { id: true, name: true, componentCode: true } } },
        })
      : null;

    if (componentId && (!component || component.assetId !== assetId)) {
      return NextResponse.json({ success: false, error: 'Component not found for this asset' }, { status: 404 });
    }

    const targetName = component?.name || asset.name;
    const targetCode = component?.componentCode || asset.assetTag;
    const parentContext = component?.parent?.name ? ' It is installed inside ' + component.parent.name + '.' : '';
    const specs = component?.specification || asset.specification || '{}';

    let stylePrompt = 'Create a photorealistic industrial engineering close-up, realistic metal and rubber finishes, true-to-life workshop lighting, clean neutral background.';
    if (visualType === 'exploded') {
      stylePrompt = 'Create an exploded-view industrial engineering render with parts separated along assembly axes, realistic materials, clear mechanical interfaces, neutral studio background.';
    } else if (visualType === 'technical_2d') {
      stylePrompt = 'Create a precise orthographic 2D engineering illustration, clean linework, light blueprint styling, no dimensions or text labels, white background.';
    }

    const prompt = stylePrompt
      + '\nSubject: ' + targetName + ' (' + targetCode + ') from ' + asset.name + '.' + parentContext
      + '\nMachine context: ' + (asset.description || '')
      + '\nManufacturer/model: ' + (asset.manufacturer || 'industrial') + ' ' + (asset.model || '')
      + '\nTechnical specification context: ' + specs
      + '\nShow the selected subject prominently and accurately. Avoid decorative fantasy details, logos, watermarks, text overlays, people, or unrelated equipment.';

    const filename = safeSlug(asset.assetTag) + '-' + safeSlug(targetCode) + '-' + safeSlug(visualType) + '-' + Date.now() + '.png';
    const generated = await saveImage(prompt, filename);

    await db.componentVisual.updateMany({
      where: {
        isPrimary: true,
        visualType,
        ...(componentId ? { componentId } : { assetId, componentId: null }),
      },
      data: { isPrimary: false },
    });

    const zoomLevel = component ? (
      component.componentType === 'assembly' ? 1 :
      component.componentType === 'subassembly' ? 2 :
      component.componentType === 'component' ? 3 :
      component.componentType === 'part' ? 4 : 3
    ) : 0;

    const visual = await db.componentVisual.create({
      data: {
        assetId,
        componentId,
        visualType,
        title: targetName + ' — ' + visualType.replace(/_/g, ' '),
        description: 'Generated visual for ' + targetName + ' in ' + asset.name + '.',
        imageUrl: generated.imageUrl,
        thumbnailUrl: generated.imageUrl,
        sourceProvider: generated.provider,
        sourcePrompt: prompt,
        zoomLevel,
        isPrimary: true,
        generatedAt: new Date(),
        createdById: session.userId,
      },
    });

    return NextResponse.json({ success: true, data: visual }, { status: 201 });
  } catch (error: unknown) {
    const rawMessage = error instanceof Error ? error.message : 'AI visual generation failed';
    const insufficientZaiBalance = /Image generation API error \(429\)/i.test(rawMessage)
      && (/1113/.test(rawMessage) || /insufficient balance|no resource package/i.test(rawMessage));
    const message = insufficientZaiBalance
      ? 'Z.ai image generation is configured correctly, but this account has no available image-generation balance or resource package. Recharge Z.ai image credits or assign a resource package, then retry.'
      : rawMessage;
    return NextResponse.json({ success: false, error: message }, { status: insufficientZaiBalance ? 402 : 500 });
  }
}