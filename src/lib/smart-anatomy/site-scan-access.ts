import {NextRequest} from 'next/server';
import {db} from '@/lib/db';
import {getSession, hasPermission, isAdmin} from '@/lib/auth';
import {canAccessPlantStrict, getPlantScope} from '@/lib/plant-scope';
import {scanCaptureFromAudit} from '@/lib/smart-anatomy/site-scan';

type Session=NonNullable<ReturnType<typeof getSession>>;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const scanManager=(session:Session)=>isAdmin(session)||hasPermission(session,'digital_twin.manage');

/** Only site-owned as-built scans, not OEM drawings or other asset models. */
export async function authorizedSiteScan(req:NextRequest,id:string,session:Session,manager:boolean){
  if(!uuid.test(id))return null;
  const scope=await getPlantScope(req,session);
  if(scope.denyAccess)return null;
  const model=await db.assetModel.findUnique({where:{id},select:{
    id:true,assetId:true,isActive:true,uploadedById:true,filePath:true,
    asset:{select:{plantId:true}},
  }});
  if(!model||model.filePath!==`/api/smart-anatomy/models/${id}/file`||
     !canAccessPlantStrict(scope,model.asset.plantId)||
     (!manager&&!model.isActive))return null;
  const created=await db.auditLog.findFirst({
    where:{entityType:'asset_model',entityId:id,action:'create'},
    select:{newValues:true},orderBy:{createdAt:'asc'},
  });
  if(!scanCaptureFromAudit(created?.newValues))return null;
  const withdrawn=await db.auditLog.findFirst({
    where:{entityType:'asset_model',entityId:id,action:'withdraw'},select:{id:true},
  });
  return withdrawn?null:model;
}
