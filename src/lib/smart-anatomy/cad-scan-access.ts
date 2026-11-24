import {db} from '@/lib/db';

/** A manufacturer/source design is valid only when approved for the exact
 * installed machine; a photogrammetry mesh or training example is NOT CAD.
 */
export async function authorizedCadReference(id:string,assetId:string){
  const cad=await db.assetModel.findUnique({where:{id},select:{
    id:true,assetId:true,filePath:true,isActive:true,uploadedById:true,
  }});
  if(!cad||cad.assetId!==assetId||!cad.isActive||
     cad.filePath!==`/api/smart-anatomy/models/${id}/file`)return null;
  const source=await db.auditLog.findFirst({where:{
    entityType:'asset_model',entityId:id,action:'create',
  },select:{newValues:true},orderBy:{createdAt:'asc'}});
  try{
    const origin=JSON.parse(source?.newValues||'{}') as {sourceOrigin?:unknown};
    if(origin.sourceOrigin!=='licensed-oem'&&origin.sourceOrigin!=='site-owned-design')return null;
  }catch{return null;}
  const withdrawn=await db.auditLog.findFirst({where:{
    entityType:'asset_model',entityId:id,action:'withdraw',
  },select:{id:true}});
  return withdrawn?null:cad;
}
