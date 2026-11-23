import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { canAccessPlantStrict, getPlantScope } from '@/lib/plant-scope';
import { getSession, hasPermission, isAdmin, type SessionData } from '@/lib/auth';
import { isMachinePhotoViewpoint } from '@/lib/machine-photo-views';

async function canAccessAsset(
  request: NextRequest,
  session: SessionData,
  assetId: string,
): Promise<boolean> {
  const [plantScope, asset] = await Promise.all([
    getPlantScope(request, session),
    db.asset.findUnique({ where: { id: assetId }, select: { plantId: true } }),
  ]);
  return Boolean(asset && canAccessPlantStrict(plantScope, asset.plantId));
}

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const assetId = searchParams.get('assetId');
    const componentId = searchParams.get('componentId');
    const visualType = searchParams.get('visualType');

    if (!assetId && !componentId) {
      return NextResponse.json({ success: false, error: 'assetId or componentId is required' }, { status: 400 });
    }

    let resolvedAssetId = assetId;
    if (!resolvedAssetId && componentId) {
      const component = await db.componentRegistry.findUnique({
        where: { id: componentId },
        select: { assetId: true },
      });
      resolvedAssetId = component?.assetId || null;
    }

    if (!resolvedAssetId || !(await canAccessAsset(request, session, resolvedAssetId))) {
      return NextResponse.json({ success: false, error: 'Asset not found or not accessible' }, { status: 404 });
    }

    if (!isAdmin(session)
      && !hasPermission(session, 'assets.view')
      && !hasPermission(session, 'assets.view_all')
      && !hasPermission(session, 'digital_twin.view')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const visuals = await db.componentVisual.findMany({
      where: {
        isActive: true,
        ...(assetId ? { assetId } : {}),
        ...(componentId ? { componentId } : {}),
        ...(visualType ? { visualType } : {}),
      },
      orderBy: [{ zoomLevel: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
    });

    return NextResponse.json({ success: true, data: visuals });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load visuals';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    if (!isAdmin(session)
      && !hasPermission(session, 'digital_twin.manage')
      && !hasPermission(session, 'assets.hierarchy')) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const {
      assetId, componentId, visualType = 'photo', title, description, imageUrl,
      thumbnailUrl, hotspotData, cameraData, sourceProvider = 'uploaded',
      sourcePrompt, zoomLevel = 0, sortOrder = 0, isPrimary = false,
    } = body;

    if (!assetId && !componentId) {
      return NextResponse.json({ success: false, error: 'assetId or componentId is required' }, { status: 400 });
    }
    if(visualType==='photo'&&!/^https:\/\//i.test(String(imageUrl||''))&&
      !String(imageUrl||'').startsWith('/api/files/')){
      return NextResponse.json({success:false,error:'Use an approved HTTPS photo URL or stored file URL'},{status:400});
    }
    if (visualType === 'photo' && cameraData != null &&
        !isMachinePhotoViewpoint((cameraData as {viewpoint?:unknown})?.viewpoint)) {
      return NextResponse.json({success:false,error:'Choose a valid machine photo elevation'},{status:400});
    }
    if (!title || !imageUrl) {
      return NextResponse.json({ success: false, error: 'title and imageUrl are required' }, { status: 400 });
    }

    let resolvedAssetId = assetId || null;
    if (componentId) {
      const component = await db.componentRegistry.findUnique({
        where: { id: componentId },
        select: { assetId: true },
      });
      if (!component) {
        return NextResponse.json({ success: false, error: 'Component not found' }, { status: 404 });
      }
      if (assetId && component.assetId !== assetId) {
        return NextResponse.json({ success: false, error: 'Component belongs to a different asset' }, { status: 400 });
      }
      resolvedAssetId = component.assetId;
    }

    if (!resolvedAssetId || !(await canAccessAsset(request, session, resolvedAssetId))) {
      return NextResponse.json({ success: false, error: 'Asset not found or not accessible' }, { status: 404 });
    }

    if (isPrimary) {
      await db.componentVisual.updateMany({
        where: {
          isPrimary: true,
          visualType,
          ...(componentId ? { componentId } : { assetId: resolvedAssetId, componentId: null }),
        },
        data: { isPrimary: false },
      });
    }

    const visual = await db.componentVisual.create({
      data: {
        assetId: resolvedAssetId,
        componentId: componentId || null,
        visualType,
        title,
        description: description || null,
        imageUrl,
        thumbnailUrl: thumbnailUrl || null,
        hotspotData: hotspotData ? JSON.stringify(hotspotData) : null,
        cameraData: cameraData ? JSON.stringify(cameraData) : null,
        sourceProvider,
        sourcePrompt: sourcePrompt || null,
        zoomLevel: Number(zoomLevel) || 0,
        sortOrder: Number(sortOrder) || 0,
        isPrimary: Boolean(isPrimary),
        generatedAt: ['uploaded','customer_supplied','external_reference'].includes(sourceProvider) ? null : new Date(),
        createdById: session.userId,
      },
    });

    return NextResponse.json({ success: true, data: visual }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create visual';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
/** Maintains explicit manufacturer/factory image annotations, never inferred geometry. */
export async function PATCH(request:NextRequest){
  try{
    const session=getSession(request);
    if(!session)return NextResponse.json({success:false,error:'Not authenticated'},{status:401});
    if(!isAdmin(session)&&!hasPermission(session,'digital_twin.manage')&&!hasPermission(session,'assets.hierarchy'))
      return NextResponse.json({success:false,error:'Insufficient permissions'},{status:403});
    const body=await request.json() as Record<string,unknown>;
    const id=String(body.id||'').trim();
    const visual=await db.componentVisual.findUnique({where:{id},select:{
      id:true,assetId:true,visualType:true,
    }});
    if(!visual||visual.visualType!=='photo'||!visual.assetId)
      return NextResponse.json({success:false,error:'Photo visual not found'},{status:404});
    if(!(await canAccessAsset(request,session,visual.assetId)))
      return NextResponse.json({success:false,error:'Access denied'},{status:403});
    const items=body.hotspotData;
    if(!Array.isArray(items)||items.length>60)
      return NextResponse.json({success:false,error:'No more than 60 photo hotspots are allowed'},{status:400});
    const ids=[...new Set(items.map((x:unknown)=>String((x as {componentId?:unknown})?.componentId||'')))];
    const registered=await db.componentRegistry.findMany({where:{
      id:{in:ids},assetId:visual.assetId,
    },select:{id:true}});
    if(registered.length!==ids.length)
      return NextResponse.json({success:false,error:'Hotspots must refer to registered parts of this machine'},{status:400});
    const normalized=items.map((item:unknown)=>{
      const r=item as {x?:unknown;y?:unknown;componentId?:unknown};
      const x=Number(r?.x),y=Number(r?.y),componentId=String(r?.componentId||'');
      if(!Number.isFinite(x)||!Number.isFinite(y)||x<0||x>1||y<0||y>1||!ids.includes(componentId))
        throw new Error('Invalid photo marker position or component');
      return {x,y,componentId};
    });
    // Marker changes and their audit evidence must commit or roll back together.
    const updated=await db.$transaction(async tx=>{
      const saved=await tx.componentVisual.update({where:{id},data:{hotspotData:JSON.stringify(normalized)}});
      await tx.auditLog.create({data:{userId:session.userId,action:'update',
        entityType:'component_visual',entityId:id,
        newValues:JSON.stringify({verifiedPhotoHotspots:normalized.length})}});
      return saved;
    });
    return NextResponse.json({success:true,data:updated});
  }catch(error){
    const msg=error instanceof Error?error.message:'Failed to save photo markers';
    return NextResponse.json({success:false,error:msg},{status:/Invalid photo/.test(msg)?400:500});
  }
}
