import {NextRequest, NextResponse} from 'next/server';
import {db} from '@/lib/db';
import {getSession} from '@/lib/auth';
import {authorizedSiteScan, scanManager} from '@/lib/smart-anatomy/site-scan-access';

export const runtime='nodejs';
type Ctx={params:Promise<{id:string;hotspotId:string}>};

/** Site-scan markers require a second person to inspect the machine and
 * identify the correct registered part. Surface scans do not prove internals.
 */
export async function POST(req:NextRequest,{params}:Ctx){
  const session=getSession(req);
  if(!session)return NextResponse.json({success:false,error:'Not authenticated'},{status:401});
  if(!scanManager(session))return NextResponse.json({
    success:false,error:'Engineering management permission required',
  },{status:403});
  const {id,hotspotId}=await params;
  const model=await authorizedSiteScan(req,id,session,true);
  if(!model)return NextResponse.json({success:false,error:'Site scan unavailable'},{status:404});
  let body:Record<string,unknown>;
  try{body=await req.json() as Record<string,unknown>;}catch{
    return NextResponse.json({success:false,error:'Invalid review request'},{status:400});
  }
  const note=String(body.reviewNote||'').trim();
  if(note.length<15||note.length>1000||
     body.physicalComponentMatched!==true||body.modelScaleChecked!==true) {
    return NextResponse.json({success:false,
      error:'Independent engineer must verify physical component, measured 3D scale and review note',
    },{status:400});
  }
  const outcome=await db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "asset_models" WHERE id = ${id} FOR UPDATE`;
    // Serialize with OEM/scan revision withdrawal; stale pre-lock checks
    // cannot approve or mutate a withdrawn scan.
    const withdrawn=await tx.auditLog.findFirst({
      where:{entityType:'asset_model',entityId:id,action:'withdraw'},
      select:{id:true},
    });
    if(withdrawn)return 'withdrawn' as const;
    const marker=await tx.siteScanHotspot.findFirst({where:{
      id:hotspotId,modelId:id,assetId:model.assetId,
    },select:{id:true,componentId:true,createdById:true,isApproved:true,
      positionX:true,positionY:true,positionZ:true,label:true,
      component:{select:{assetId:true,lifecycleStatus:true}},
    }});
    if(!marker)return 'not-found';
    if(marker.isApproved)return 'already-reviewed';
    if(marker.createdById===session.userId||model.uploadedById===session.userId){
      return 'independent-review-required';
    }
    if(marker.component.assetId!==model.assetId ||
        marker.component.lifecycleStatus==='uncommissioned')return 'uncommissioned-component';
    const result=await tx.siteScanHotspot.update({where:{id:hotspotId},data:{
      isApproved:true,reviewedById:session.userId,reviewNote:note,
    }});
    await tx.auditLog.create({data:{
      userId:session.userId,action:'approve',entityType:'site_scan_hotspot',entityId:hotspotId,
      oldValues:JSON.stringify({isApproved:false}),
      newValues:JSON.stringify({isApproved:true,modelId:id,componentId:marker.componentId,
        position:{x:marker.positionX,y:marker.positionY,z:marker.positionZ},
        independentReviewerId:session.userId,modelScaleChecked:true,
        physicalComponentMatched:true,reviewNote:note,
        notAnOemInternalPartCertification:true}),
    }});
    return result;
  });
  if(typeof outcome==='string')return NextResponse.json({
    success:false,error:outcome,
  },{status:outcome==='not-found'?404:409});
  return NextResponse.json({success:true,data:{id:outcome.id,isApproved:true}});
}
