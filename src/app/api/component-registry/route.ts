import { persistOpeningMeterReadings } from '@/services/assets/assetMeter.service';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { canCreateComponentHierarchy } from '@/lib/component-registry-permissions';
import { canAccessPlant, getPlantScope } from '@/lib/plant-scope';
import { normalizeCommissioningParameters, normalizeCommissioningMeters, partMeterName } from '@/lib/asset-onboarding';

export async function GET(request: NextRequest) {
  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    // Allow component search by assetId for any authenticated user (e.g. technicians creating WO materials/returns)
    const { searchParams } = new URL(request.url);
    const assetIdParam = searchParams.get('assetId');
    if (!hasPermission(session, 'digital_twin.view') && !isAdmin(session) && !assetIdParam) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    const twinId = searchParams.get('twinId');
    const assetId = assetIdParam;
    const parentId = searchParams.get('parentId');
    const componentType = searchParams.get('componentType');
    const criticality = searchParams.get('criticality');
    const lifecycleStatus = searchParams.get('lifecycleStatus');
    const search = searchParams.get('search');
    let page = parseInt(searchParams.get('page') || '1', 10);
    let limit = parseInt(searchParams.get('limit') || '50', 10);
    page = Math.max(1, isNaN(page) ? 1 : page);
    limit = Math.min(100, Math.max(1, isNaN(limit) ? 50 : limit));

    const where: Record<string, unknown> = {};

    if (!plantScope.isSystemWide) {
      const allowedPlantIds = plantScope.isScoped && plantScope.plantId
        ? [plantScope.plantId]
        : plantScope.accessiblePlantIds;
      where.asset = {
        plantId: { in: allowedPlantIds.length > 0 ? allowedPlantIds : ['__ACCESS_DENIED__'] },
      };
    }

    if (twinId) where.twinId = twinId;
    if (assetId) where.assetId = assetId;
    if (parentId === 'null' || parentId === '') {
      where.parentId = null;
    } else if (parentId) {
      where.parentId = parentId;
    }
    if (componentType) where.componentType = componentType;
    if (criticality) where.criticality = criticality;
    if (lifecycleStatus) where.lifecycleStatus = lifecycleStatus;

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { componentCode: { contains: search } },
        { description: { contains: search } },
      ];
    }

    const [components, total] = await Promise.all([
      db.componentRegistry.findMany({
        where: Object.keys(where).length > 0 ? where : undefined,
        include: {
          parent: { select: { id: true, name: true, componentCode: true } },
          twin: { select: { id: true, name: true } },
          asset: { select: { id: true, name: true, assetTag: true } },
          _count: {
            select: {
              children: true,
              failureRecords: true,
              sparePartLinks: true,
              toolRequirements: true,
            },
          },
        },
        orderBy: { id: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.componentRegistry.count({
        where: Object.keys(where).length > 0 ? where : undefined,
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: components,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load components';
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let errorContext: { componentCode?: unknown; name?: unknown; assetId?: unknown } = {};

  try {
    const session = getSession(request);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }

    if (!canCreateComponentHierarchy(session)) {
      return NextResponse.json({ success: false, error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    errorContext = {
      componentCode: body?.componentCode,
      name: body?.name,
      assetId: body?.assetId,
    };
    const {
      componentCode,
      name,
      description,
      componentType,
      parentId,
      twinId,
      assetId,
      manufacturer,
      modelNumber,
      serialNumber,
      specification,
      operatingParams,
      criticality,
      lifecycleStatus,
      installedDate,
      expectedLifeHours,
      operatingHours,
      lastInspection,
      nextInspectionDue,
      healthScore,
      notes,
      inspectionParameters,
      componentMeters,
    } = body;

    if (!componentCode) {
      return NextResponse.json({ success: false, error: 'componentCode is required' }, { status: 400 });
    }

    if (!name) {
      return NextResponse.json({ success: false, error: 'name is required' }, { status: 400 });
    }

    const plantScope = await getPlantScope(request, session);
    if (plantScope.denyAccess) {
      return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
    }

    let meterPlantId:string|null=null;
    if (assetId) {
      const asset = await db.asset.findUnique({
        where: { id: assetId },
        select: { id: true, plantId: true },
      });
      if (!asset) {
        return NextResponse.json({ success: false, error: 'Asset not found' }, { status: 404 });
      }
      if (!canAccessPlant(plantScope, asset.plantId)) {
        return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
      }
      meterPlantId=asset.plantId;
    }

    // Check unique componentCode
    const existingCode = await db.componentRegistry.findUnique({ where: { componentCode } });
    if (existingCode) {
      return NextResponse.json({ success: false, error: 'Component code already exists' }, { status: 409 });
    }

    // Validate parentId if provided. A component hierarchy must remain
    // inside one parent machine/asset.
    if (parentId) {
      const parent = await db.componentRegistry.findUnique({
        where: { id: parentId },
        include: { asset: { select: { plantId: true } } },
      });
      if (!parent) {
        return NextResponse.json({ success: false, error: 'Parent component not found' }, { status: 404 });
      }
      if (!canAccessPlant(plantScope, parent.asset?.plantId)) {
        return NextResponse.json({ success: false, error: 'Plant access denied' }, { status: 403 });
      }
      if (parent.assetId !== (assetId || null)) {
        return NextResponse.json(
          { success: false, error: 'Parent component belongs to a different asset' },
          { status: 400 },
        );
      }
    }

    // Validate twinId if provided
    if (twinId) {
      const twin = await db.digitalTwin.findUnique({ where: { id: twinId } });
      if (!twin) {
        return NextResponse.json({ success: false, error: 'Digital twin not found' }, { status: 404 });
      }
    }

    // Validate serialNumber uniqueness if provided
    if (serialNumber) {
      const existingSerial = await db.componentRegistry.findUnique({ where: { serialNumber } });
      if (existingSerial) {
        return NextResponse.json({ success: false, error: 'Serial number already exists' }, { status: 409 });
      }
    }

    let parsedParameters,parsedMeters;
    try{
      parsedParameters=normalizeCommissioningParameters(inspectionParameters);
      parsedMeters=normalizeCommissioningMeters(componentMeters);
    }catch(error){return NextResponse.json({success:false,
      error:error instanceof Error?error.message:'Invalid component commissioning data'},{status:400});}
    if(parsedMeters.length&&(!assetId||
      !meterPlantId||(!isAdmin(session)&&!hasPermission(session,'meters.create'))))
      return NextResponse.json({success:false,error:'A machine and meter creation permission are required'},{status:403});
    if(parsedMeters.length&&assetId){
      const duplicate=await db.assetMeter.findMany({where:{assetId},
        select:{name:true,unit:true}});
      const keys=new Set(duplicate.map(m=>m.name.toLowerCase()+'|'+m.unit.toLowerCase()));
      if(parsedMeters.some(m=>keys.has(partMeterName(String(componentCode),m.name).toLowerCase()+'|'+m.unit.toLowerCase())))
        return NextResponse.json({success:false,error:'A meter with this name and unit already exists on the machine'},{status:409});
    }
    const component = await db.$transaction(async tx=>{
    const created=await tx.componentRegistry.create({
      data: {
        componentCode,
        name,
        description: description || null,
        componentType: componentType || 'component',
        parentId: parentId || null,
        twinId: twinId || null,
        assetId: assetId || null,
        manufacturer: manufacturer || null,
        modelNumber: modelNumber || null,
        serialNumber: serialNumber || null,
        specification: specification ? JSON.stringify(specification) : null,
        operatingParams: operatingParams ? JSON.stringify(operatingParams) : null,
        criticality: criticality || 'medium',
        lifecycleStatus: lifecycleStatus || 'operational',
        installedDate: installedDate ? new Date(installedDate) : null,
        expectedLifeHours: expectedLifeHours ? parseFloat(String(expectedLifeHours)) : null,
        operatingHours: operatingHours ? parseFloat(String(operatingHours)) : 0,
        lastInspection: lastInspection ? new Date(lastInspection) : null,
        nextInspectionDue: nextInspectionDue ? new Date(nextInspectionDue) : null,
        healthScore: healthScore !== undefined ? parseInt(String(healthScore), 10) : 100,
        notes: notes || null,
        ...(parsedParameters.length?{inspectionPoints:{create:parsedParameters.map((p,index)=>({
          name:p.name,description:p.reference||null,inspectionType:p.inspectionType,
          parameterKey:p.key,normalRange:JSON.stringify({min:p.min,max:p.max,unit:p.unit}),
          sortOrder:index,isActive:true,
        }))}}:{}),
      },
      include: {
        parent: { select: { id: true, name: true, componentCode: true } },
        twin: { select: { id: true, name: true } },
        asset: { select: { id: true, name: true, assetTag: true } },
        _count: {
          select: {
            children: true,
            failureRecords: true,
            sparePartLinks: true,
            toolRequirements: true,
          },
        },
      },
    });

    if(parsedMeters.length&&assetId){
      await tx.assetMeter.createMany({data:parsedMeters.map(m=>({
        assetId,componentId:created.id,name:partMeterName(String(componentCode),m.name),unit:m.unit,meterType:m.meterType,
        currentValue:m.initialValue,lastReadingAt:m.initialReadingProvided?new Date():null,
        createdById:session.userId,
      }))});
      if(meterPlantId&&parsedMeters.some(m=>m.initialReadingProvided)){
        const meters=await tx.assetMeter.findMany({where:{assetId,componentId:created.id}});
        await persistOpeningMeterReadings(tx,{assetId,plantId:meterPlantId,actorId:session.userId,meters});
      }
    }
    await tx.auditLog.create({data:{
      userId:session.userId,action:'create',entityType:'component_registry',entityId:created.id,
      newValues:JSON.stringify({componentCode,name,componentType,twinId,assetId,parentId,
        inspectionPointCount:parsedParameters.length,meterCount:parsedMeters.length}),
    }});
    return created;
    },{timeout:20000});

    return NextResponse.json({ success: true, data: component }, { status: 201 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to create component';
    // Log full details for debugging
    console.error('[API /api/component-registry POST] Failed:', {
      message,
      ...errorContext,
      errorStack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}