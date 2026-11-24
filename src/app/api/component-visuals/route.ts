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

/** Exactly the same machine-scoped marker validation for creation and edits. */
async function validatePhotoMarkers(assetId:string,input:unknown):Promise<
  Array<{componentId:string;x:number;y:number}>
> {
  if(!Array.isArray(input)||input.length>60)
    throw new Error('Invalid photo hotspots: provide an array of up to 60 markers');
  const normalized=input.map((item:unknown)=>{
    if(!item||typeof item!=='object'||Array.isArray(item))
      throw new Error('Invalid photo hotspot: marker must be an object');
    const r=item as {x?:unknown;y?:unknown;componentId?:unknown};
    const componentId=typeof r.componentId==='string'?r.componentId.trim():'';
    if(!componentId||componentId.length>128||
       typeof r.x!=='number'||!Number.isFinite(r.x)||r.x<0||r.x>1||
       typeof r.y!=='number'||!Number.isFinite(r.y)||r.y<0||r.y>1)
      throw new Error('Invalid photo hotspot: choose a real component and normalized 0–1 coordinates');
    return {componentId,x:r.x,y:r.y};
  });
  const ids=[...new Set(normalized.map(row=>row.componentId))];
  if(ids.length){
    const registered=await db.componentRegistry.findMany({
      where:{assetId,id:{in:ids}},select:{id:true},
    });
    if(registered.length!==ids.length)
      throw new Error('Invalid photo hotspot: all markers must refer to components of this machine');
  }
  return normalized;
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
    // A marker supplied during POST must satisfy the same plant/asset and
    // coordinate rules as a later PATCH. Do not persist foreign part IDs.
    const photoMarkers=visualType==='photo'&&hotspotData!=null
      ?await validatePhotoMarkers(resolvedAssetId,hotspotData):null;

    // Primary-view replacement, new photo and provenance audit must commit
    // together. Lock this machine/view scope to serialize concurrent uploads.
    const visual = await db.$transaction(async tx=>{
      if (isPrimary) {
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))',
          'iassetspro:component-visual-primary:'+resolvedAssetId+':'+
          (componentId||'machine')+':'+visualType);
        await tx.componentVisual.updateMany({
          where: {
            isPrimary: true,visualType,
            ...(componentId ? { componentId } : { assetId: resolvedAssetId, componentId: null }),
          },
          data: { isPrimary: false },
        });
      }

      const created = await tx.componentVisual.create({
      data: {
        assetId: resolvedAssetId,
        componentId: componentId || null,
        visualType,
        title,
        description: description || null,
        imageUrl,
        thumbnailUrl: thumbnailUrl || null,
        hotspotData: visualType==='photo'
          ?(photoMarkers!==null?JSON.stringify(photoMarkers):null)
          :(hotspotData?JSON.stringify(hotspotData):null),
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
      await tx.auditLog.create({data:{
        userId:session.userId,action:'create',
        entityType:'component_visual',entityId:created.id,
        newValues:JSON.stringify({
          assetId:resolvedAssetId,componentId:componentId||null,
          visualType,sourceProvider,isPrimary:Boolean(isPrimary),
          photoHotspots:photoMarkers?.length||0,
        }),
      }});
      return created;
    });

    return NextResponse.json({ success: true, data: visual }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create visual';
    return NextResponse.json({ success: false, error: message },
      { status: message.startsWith('Invalid photo hotspot') ? 400 : 500 });
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
    const normalized=await validatePhotoMarkers(visual.assetId,body.hotspotData);
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
