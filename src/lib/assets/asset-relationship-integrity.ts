import type { Prisma } from '@prisma/client';
type Client=Pick<Prisma.TransactionClient,'asset'|'department'>;
/** Validate the effective equipment relationships, not only changed fields. */
export async function validateAssetRelationships(client:Client,input:{plantId:string;departmentId?:unknown;parentId?:unknown;assetId?:string}):Promise<string|null>{
  if(input.departmentId!=null&&input.departmentId!==''){
    if(typeof input.departmentId!=='string')return 'Invalid department';
    const department=await client.department.findUnique({where:{id:input.departmentId},select:{plantId:true}});
    if(!department||department.plantId!==input.plantId)return 'Department must belong to the machine plant';
  }
  if(input.parentId==null||input.parentId==='')return null;
  if(typeof input.parentId!=='string')return 'Invalid parent asset';
  const visited=new Set<string>();
  let id:string|null=input.parentId;
  while(id){
    if(id===input.assetId||visited.has(id)||visited.size>=64)return 'Asset parent would create a cycle or exceeds the validated hierarchy depth';
    visited.add(id);
    const parent:{plantId:string;parentId:string|null}|null=await client.asset.findUnique({where:{id},select:{plantId:true,parentId:true}});
    if(!parent||parent.plantId!==input.plantId)return 'Parent asset must belong to the machine plant';
    id=parent.parentId;
  }
  return null;
}
