import {NextRequest,NextResponse} from 'next/server';
import {db} from '@/lib/db';
import {readBoundedJsonObject,BoundedJsonError} from '@/lib/smart-anatomy/bounded-json';
import {getSession,hasPermission} from '@/lib/auth';
import {authorizedSiteScan,scanManager} from '@/lib/smart-anatomy/site-scan-access';
import {solveCadToScanAlignment} from '@/lib/smart-anatomy/cad-scan-alignment';
import {authorizedCadReference} from '@/lib/smart-anatomy/cad-scan-access';

export const runtime='nodejs';
export const dynamic='force-dynamic';
type Ctx={params:Promise<{id:string}>};
const bad=(status:number,error:string)=>NextResponse.json({success:false,error},{status});

export async function GET(req:NextRequest,{params}:Ctx){
  const session=getSession(req);
  if(!session)return bad(401,'Not authenticated');
  const manager=scanManager(session);
  if(!manager&&!hasPermission(session,'digital_twin.view'))return bad(403,'Digital Twin view permission required');
  const {id}=await params;
  const scan=await authorizedSiteScan(req,id,session,manager);
  if(!scan||!scan.isActive)return bad(404,'Approved physical site scan not found');
  const alignment=await db.siteScanAlignment.findUnique({where:{scanModelId:id}});
  if(!alignment||(!manager&&!alignment.isApproved)) {
    return NextResponse.json({success:true,data:null},{headers:{'Cache-Control':'private, no-store'}});
  }
  const cad=await authorizedCadReference(alignment.cadModelId,scan.assetId);
  if(!cad)return bad(409,'Engineering reference was withdrawn or is not approved');
  const data={
    id:alignment.id,scanModelId:id,cadModelId:cad.id,
    cadModelUrl:cad.filePath,isApproved:alignment.isApproved,
    translation:{
      x:alignment.translationX,y:alignment.translationY,z:alignment.translationZ,
    },
    rotation:[alignment.rotationX,alignment.rotationY,alignment.rotationZ,alignment.rotationW],
    rmsErrorMetres:alignment.rmsErrorMetres,
    maxErrorMetres:alignment.maxErrorMetres,
    maxRelativeDistanceError:alignment.maxRelativeDistanceError,
    ...(manager?{
      landmarks:JSON.parse(alignment.landmarks) as unknown,
      createdById:alignment.createdById,reviewedById:alignment.reviewedById,
      reviewNote:alignment.reviewNote,
    }:{}),
  };
  return NextResponse.json({success:true,data},{headers:{'Cache-Control':'private, no-store'}});
}

/** A scan may be registered against one exact CAD revision. Store a proposed
 * rigid transform, never a speculative scale fit or unverified merger.
 */
export async function POST(req:NextRequest,{params}:Ctx){
  const session=getSession(req);
  if(!session)return bad(401,'Not authenticated');
  if(!scanManager(session))return bad(403,'Engineering management permission required');
  const {id}=await params;
  const scan=await authorizedSiteScan(req,id,session,true);
  if(!scan||!scan.isActive)return bad(404,'Approved site scan not found');
  let body:Record<string,unknown>;
  try{body=await readBoundedJsonObject(req,24000);}catch(e){
    return bad(e instanceof BoundedJsonError?e.status:400,
      e instanceof Error?e.message:'Invalid correspondence request');
  }
  const cadModelId=String(body.cadModelId||'');
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cadModelId)||
     cadModelId===id)return bad(400,'Choose a separate approved CAD drawing revision');
  const cad=await authorizedCadReference(cadModelId,scan.assetId);
  if(!cad)return bad(409,'CAD must be approved and belong to the same installed machine');
  let registration:ReturnType<typeof solveCadToScanAlignment>;
  try{registration=solveCadToScanAlignment(body.landmarks);}catch(e){
    return bad(400,e instanceof Error?e.message:'Invalid physical landmark evidence');
  }
  const result=await db.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "asset_models" WHERE id = ${id} OR id = ${cadModelId} ORDER BY id FOR UPDATE`;
    const [scanCurrent,cadCurrent,old,withdrawn]=await Promise.all([
      tx.assetModel.findUnique({where:{id},select:{isActive:true,assetId:true}}),
      tx.assetModel.findUnique({where:{id:cadModelId},select:{isActive:true,assetId:true}}),
      tx.siteScanAlignment.findUnique({where:{scanModelId:id},select:{id:true}}),
      tx.auditLog.findFirst({where:{
        entityType:'asset_model',action:'withdraw',entityId:{in:[id,cadModelId]},
      },select:{id:true}}),
    ]);
    if(!scanCurrent?.isActive||!cadCurrent?.isActive||old||withdrawn||
       scanCurrent.assetId!==scan.assetId||cadCurrent.assetId!==scan.assetId)return null;
    const {solution,landmarks}=registration;
    const created=await tx.siteScanAlignment.create({data:{
      scanModelId:id,cadModelId,assetId:scan.assetId,
      landmarks:JSON.stringify(landmarks),
      translationX:solution.translation.x,translationY:solution.translation.y,translationZ:solution.translation.z,
      rotationX:solution.rotation[0],rotationY:solution.rotation[1],
      rotationZ:solution.rotation[2],rotationW:solution.rotation[3],
      rmsErrorMetres:solution.rmsErrorMetres,maxErrorMetres:solution.maxErrorMetres,
      maxRelativeDistanceError:solution.maxRelativeDistanceError,
      createdById:session.userId,isApproved:false,
    }});
    await tx.auditLog.create({data:{
      userId:session.userId,action:'create',
      entityType:'site_scan_alignment',entityId:created.id,
      newValues:JSON.stringify({scanModelId:id,cadModelId,
        solution,landmarks,approved:false,manufacturerCertified:false,
        alignmentOnly:true}),
    }});
    return created;
  });
  if(!result)return bad(409,'Scan or CAD was withdrawn or this scan already has an alignment');
  return NextResponse.json({success:true,data:{
    id:result.id,scanModelId:id,cadModelId,
    solution:registration.solution,isApproved:false,
  }},{status:201});
}
