import {NextRequest,NextResponse} from 'next/server';
import {db} from '@/lib/db';
import {readBoundedJsonObject,BoundedJsonError} from '@/lib/smart-anatomy/bounded-json';
import {getSession} from '@/lib/auth';
import {authorizedSiteScan,scanManager} from '@/lib/smart-anatomy/site-scan-access';
import {authorizedCadReference} from '@/lib/smart-anatomy/cad-scan-access';
import {solveCadToScanAlignment} from '@/lib/smart-anatomy/cad-scan-alignment';

export const runtime='nodejs';
type Ctx={params:Promise<{id:string}>};
const bad=(status:number,error:string)=>NextResponse.json({success:false,error},{status});

/** Independent measured engineering review, never an AI visual resemblance
 * certification. This approves spatial alignment for inspection only.
 */
export async function POST(req:NextRequest,{params}:Ctx){
  const session=getSession(req);
  if(!session)return bad(401,'Not authenticated');
  if(!scanManager(session))return bad(403,'Engineering management permission required');
  const {id}=await params;
  const scan=await authorizedSiteScan(req,id,session,true);
  if(!scan||!scan.isActive)return bad(404,'Approved site scan not found');
  let body:Record<string,unknown>;
  try{body=await readBoundedJsonObject(req,12000);}catch(e){
    return bad(e instanceof BoundedJsonError?e.status:400,
      e instanceof Error?e.message:'Invalid alignment review request');
  }
  const reviewNote=String(body.reviewNote||'').trim();
  if(body.cadRevisionMatched!==true||body.scanScaleReviewed!==true||
     body.landmarkEvidenceReviewed!==true||reviewNote.length<30||reviewNote.length>1000){
    return bad(400,'Independently check exact CAD revision, actual scan measurement scale and physical landmark evidence');
  }
  const initial=await db.siteScanAlignment.findUnique({where:{scanModelId:id},
    select:{cadModelId:true,createdById:true,isApproved:true}});
  if(!initial)return bad(404,'Proposed CAD-to-scan alignment is missing');
  const cad=await authorizedCadReference(initial.cadModelId,scan.assetId);
  if(!cad)return bad(409,'CAD reference is not approved for this exact installed machine');
  if(initial.createdById===session.userId||scan.uploadedById===session.userId||
     cad.uploadedById===session.userId) {
    return bad(409,'Alignment requires an independent engineer, not the author or either model uploader');
  }
  const result=await db.$transaction(async tx=>{
    const cadId=initial.cadModelId;
    await tx.$queryRaw`SELECT id FROM "asset_models" WHERE id = ${id} OR id = ${cadId} ORDER BY id FOR UPDATE`;
    const [current,scanNow,cadNow,withdrawn]=await Promise.all([
      tx.siteScanAlignment.findUnique({where:{scanModelId:id}}),
      tx.assetModel.findUnique({where:{id},select:{isActive:true,assetId:true}}),
      tx.assetModel.findUnique({where:{id:cadId},select:{isActive:true,assetId:true}}),
      tx.auditLog.findFirst({where:{
        entityType:'asset_model',action:'withdraw',entityId:{in:[id,cadId]},
      },select:{id:true}}),
    ]);
    if(!current||current.isApproved||current.cadModelId!==cadId||
       !scanNow?.isActive||!cadNow?.isActive||withdrawn||
       scanNow.assetId!==scan.assetId||cadNow.assetId!==scan.assetId||
       current.assetId!==scan.assetId||current.createdById===session.userId){
      return null;
    }
    let independentlyRecomputed:ReturnType<typeof solveCadToScanAlignment>['solution'];
    try{
      independentlyRecomputed=solveCadToScanAlignment(JSON.parse(current.landmarks)).solution;
    }catch{return null;}
    const src=[
      current.translationX,current.translationY,current.translationZ,
      current.rotationX,current.rotationY,current.rotationZ,current.rotationW,
      current.rmsErrorMetres,current.maxErrorMetres,current.maxRelativeDistanceError,
    ];
    const recalc=[
      independentlyRecomputed.translation.x,independentlyRecomputed.translation.y,
      independentlyRecomputed.translation.z,
      ...independentlyRecomputed.rotation,independentlyRecomputed.rmsErrorMetres,
      independentlyRecomputed.maxErrorMetres,independentlyRecomputed.maxRelativeDistanceError,
    ];
    if(src.some((value,index)=>Math.abs(value-recalc[index])>1e-7)){
      return null;
    }
    const approved=await tx.siteScanAlignment.update({where:{id:current.id},data:{
      isApproved:true,reviewedById:session.userId,reviewedAt:new Date(),reviewNote,
    }});
    await tx.auditLog.create({data:{
      userId:session.userId,action:'approve',entityType:'site_scan_alignment',entityId:approved.id,
      oldValues:JSON.stringify({isApproved:false}),
      newValues:JSON.stringify({
        isApproved:true,scanModelId:id,cadModelId:cadId,
        reviewerId:session.userId,cadRevisionMatched:true,
        scanScaleReviewed:true,landmarkEvidenceReviewed:true,reviewNote,
        rmsErrorMetres:approved.rmsErrorMetres,
        maxErrorMetres:approved.maxErrorMetres,
        onlyVisualInspection:true,noEngineeringDisassemblyApproval:true,
      }),
    }});
    return approved;
  });
  if(!result)return bad(409,'Alignment was changed, withdrawn, already approved or failed geometry verification');
  return NextResponse.json({success:true,data:{
    id:result.id,isApproved:true,scanModelId:id,
    cadModelId:result.cadModelId,rmsErrorMetres:result.rmsErrorMetres,
  }});
}
