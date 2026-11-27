import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getSession, hasPermission, isAdmin } from '@/lib/auth';
import { getPlantScope, canAccessPlantStrict } from '@/lib/plant-scope';
import { readMachineParameters } from '@/lib/asset-onboarding';
import { machinePhotoViewpoint } from '@/lib/machine-photo-views';
import { allowedProductionMeter, allowedRuntimeMeter } from '@/lib/production-shift-survey';
import { componentInspectionPointNeedsReview, evaluateMachineCommissioningReadiness } from '@/lib/assets/machine-commissioning-readiness';

export const dynamic = 'force-dynamic';

/**
 * Read-only live database preflight for the exact selected machine.
 * Configured rows indicate software setup, NOT approval of installed OEM
 * geometry, source licensing, operating limits or a completed UAT.
 */
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}) {
  const session=getSession(request);
  if(!session)return NextResponse.json({success:false,error:'Not authenticated'},{status:401});
  if(!isAdmin(session) &&
      !['assets.view','assets.view_all','assets.update','digital_twin.manage']
        .some(permission=>hasPermission(session,permission))) {
    return NextResponse.json({success:false,error:'Insufficient permissions'},{status:403});
  }
  try {
    const {id}=await params;
    if(!id || id.length>128)return NextResponse.json({success:false,error:'Invalid asset'},{status:400});
    const scope=await getPlantScope(request,session);
    if(scope.denyAccess)return NextResponse.json({success:false,error:'Forbidden'},{status:403});
    const asset=await db.asset.findUnique({where:{id},select:{
      id:true,plantId:true,manufacturer:true,model:true,serialNumber:true,specification:true,
    }});
    if(!asset)return NextResponse.json({success:false,error:'Machine not found'},{status:404});
    if(!canAccessPlantStrict(scope,asset.plantId))
      return NextResponse.json({success:false,error:'Forbidden'},{status:403});

    const today=new Date().toISOString().slice(0,10);
    const first=new Date(today+'T00:00:00.000Z');
    const future=new Date(first.getTime()+31*86400000);
    const window={assetId:id,plantId:asset.plantId,productionDate:{gte:first,lt:future}};
    // Roster eligibility can change after the planner originally saved a shift.
    const eligibleCrewUser={status:'active',plantAccess:{some:{plantId:asset.plantId}}};
    const [
      locationAssignments,registeredComponents,uncommissionedComponents,
      meters,photos,models,pm,scheduledShifts,shiftsWithLeader,approvedProductionShifts,componentPoints,
    ]=await Promise.all([
      db.assetFunctionalLocationAssignment.count({where:{
        assetId:id,endedAt:null,
        functionalLocation:{
          status:'active',plantId:asset.plantId,
          hierarchySystem:{isActive:true},
          hierarchyLevel:{isActive:true,allowAssetAssignment:true},
        },
      }}),
      db.componentRegistry.count({where:{assetId:id}}),
      db.componentRegistry.count({where:{assetId:id,lifecycleStatus:'uncommissioned'}}),
      db.assetMeter.findMany({where:{assetId:id,isActive:true},
        select:{meterType:true,unit:true,lastReadingAt:true},take:200}),
      db.componentVisual.findMany({where:{assetId:id,visualType:'photo',isActive:true},
        select:{cameraData:true,sourceProvider:true,imageUrl:true},orderBy:{createdAt:'desc'},take:500}),
      db.assetModel.findMany({where:{assetId:id,filePath:{startsWith:'/api/smart-anatomy/models/'}},
        select:{isActive:true},take:500}),
      db.pmScheduleTask.findMany({where:{assetId:id,isActive:true},
        select:{basis:true,pmType:true,pmTaskId:true},take:1000}),
      db.productionShiftPlan.count({where:window}),
      db.productionShiftPlan.count({where:{
        ...window,
        shift:{isActive:true,plantId:asset.plantId},
        crew:{
          some:{isLeader:true,user:eligibleCrewUser},
          none:{user:{NOT:eligibleCrewUser}},
        },
      }}),
      db.productionShiftRecord.count({where:{assetId:id,status:'approved'}}),
      db.componentInspectionPoint.findMany({where:{isActive:true,component:{assetId:id,lifecycleStatus:{not:'decommissioned'}}},
        select:{inspectionType:true,description:true,normalRange:true}}),
    ]);
    let specification:Record<string,unknown>={};
    try {
      const parsed=JSON.parse(asset.specification);
      if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))specification=parsed;
    } catch { /* Unsupported legacy free text is not a verified parameter configuration. */ }
    const draft=specification.aiDraft;
    const aiDraft=Boolean(draft&&typeof draft==='object'&&
      (draft as {verified?:unknown}).verified!==true);

    const inspectionParameters=readMachineParameters(asset.specification);
    const inspectionParametersNeedingReview=inspectionParameters.filter(parameter=>
      !parameter.reference.trim() || (parameter.inspectionType==='measurement' &&
        (parameter.min===null && parameter.max===null)),
    ).length;
    const productionMeters=meters.filter(m=>allowedProductionMeter(m.meterType));
    const runtimeMeters=meters.filter(m=>allowedRuntimeMeter(m.meterType,m.unit));
    const result=evaluateMachineCommissioningReadiness({
      nameplate:{
        manufacturer:asset.manufacturer,model:asset.model,serial:asset.serialNumber,aiDraft,
      },
      locationAssignments,
      registeredComponents,uncommissionedComponents,
      inspectionParameters:inspectionParameters.length,
      inspectionParametersNeedingReview,
      componentInspectionPoints:componentPoints.length,
      componentInspectionPointsNeedingReview:componentPoints.filter(componentInspectionPointNeedsReview).length,
      meterCount:meters.length,
      meterReadingsObserved:meters.filter(m=>m.lastReadingAt!==null).length,
      productionMeters:productionMeters.length,
      runtimeMeters:runtimeMeters.length,
      productionMetersObserved:productionMeters.filter(m=>m.lastReadingAt!==null).length,
      runtimeMetersObserved:runtimeMeters.filter(m=>m.lastReadingAt!==null).length,
      actualPhotoViews:photos.filter(photo=>
        photo.sourceProvider==='uploaded' &&
        /^\/private-component-photos\/factory-photo-[0-9a-f-]{36}\.(?:png|jpg|webp)$/i.test(photo.imageUrl),
      ).map(photo=>machinePhotoViewpoint(photo.cameraData)),
      privateCadApproved:models.filter(model=>model.isActive).length,
      privateCadPending:models.filter(model=>!model.isActive).length,
      // A successful GLB checksum check proves byte integrity, not that this
      // is an authentic manufacturer file for the installed serial/revision.
      oemSourceAuthenticityCertified:false,
      calendarPm:pm.filter(task=>task.basis==='calendar' ||
        (!task.basis&&task.pmType==='tbm')).length,
      meterPm:pm.filter(task=>task.basis==='meter' ||
        (!task.basis&&task.pmType==='ubm')).length,
      scheduledShifts,shiftsWithLeader,approvedProductionShifts,
    });

    return NextResponse.json({success:true,data:{
      assetId:id,window:{from:today,throughExclusive:future.toISOString().slice(0,10)},
      ...result,
      note:'Configuration preflight only. Physical nameplate, true OEM CAD, drawings, manufacturer limits, site safety, PM execution and live roles still require witnessed acceptance.',
    }},{headers:{'Cache-Control':'private, no-store, max-age=0'}});
  } catch(error) {
    console.error('[GET asset commissioning readiness]',error);
    return NextResponse.json({success:false,error:'Could not verify machine commissioning readiness'},{status:500});
  }
}
