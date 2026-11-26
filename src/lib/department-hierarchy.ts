import type { Prisma } from '@prisma/client';

/** A parent chain must exist, be acyclic and remain inside the department's plant. */
export async function validateDepartmentParent(client:Pick<Prisma.TransactionClient,'department'>,
  input:{plantId:string;parentId:string;departmentId?:string}):Promise<string|null>{
  const visited=new Set<string>();
  let id:string|null=input.parentId;
  while(id){
    if(id===input.departmentId||visited.has(id)||visited.size>=64)
      return 'Department parent would create a cycle or exceeds the validated hierarchy depth';
    visited.add(id);
    const parent:{plantId:string;parentId:string|null}|null=await client.department.findUnique({
      where:{id},select:{plantId:true,parentId:true},
    });
    if(!parent)return 'Parent department not found';
    if(parent.plantId!==input.plantId)return 'Parent department belongs to a different plant';
    id=parent.parentId;
  }
  return null;
}
