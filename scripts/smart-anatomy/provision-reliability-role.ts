/**
 * Targeted production-safe RBAC provisioning for independently reviewed CAD.
 *
 * Unlike prisma/seed.ts this NEVER creates demo users, resets passwords,
 * changes user-plant scopes, or replaces existing role permissions.
 *
 * Dry-run by default. To apply after change approval / DB backup:
 *   DATABASE_URL=... bunx tsx scripts/smart-anatomy/provision-reliability-role.ts --apply
 */
import { PrismaClient } from '@prisma/client';
import { createAdapter } from '../../src/lib/create-postgres-adapter';

export const RELIABILITY_ENGINEER_PERMISSIONS = [
  'dashboard.view', 'chat.view', 'documents.view', 'documents.download',
  'assets.view', 'assets.view_all', 'equipment.view',
  'assemblies.view', 'bom.view', 'parts.view', 'meters.view',
  'maintenance_requests.view', 'work_orders.view', 'pm_schedules.view',
  'digital_twin.view', 'digital_twin.manage', 'model_viewer.view', 'hotspots.view',
  'reports.view',
] as const;

export const READ_ONLY_GEOMETRY_ROLES = [
  'maintenance_manager',
  'maintenance_planner',
  'maintenance_supervisor',
  'maintenance_technician',
] as const;
export const GEOMETRY_VIEW_PERMISSIONS = [
  'digital_twin.view', 'model_viewer.view', 'hotspots.view',
] as const;

function readablePermission(slug:string){
  const [module,action]=slug.split('.');
  return {
    slug,module,action,
    name:module.replaceAll('_',' ')+' - '+action.replaceAll('_',' '),
    description:'Authorized least-privilege industrial machine visualisation',
  };
}

async function main(){
  if(process.argv.includes('--help')){
    console.log('Usage: bunx tsx scripts/smart-anatomy/provision-reliability-role.ts [--apply]');
    return;
  }
  if(process.argv.some(arg=>arg.startsWith('--')&&arg!=='--apply')){
    throw Error('Unknown option; use --help for valid usage');
  }
  if(!process.argv.includes('--apply')){
    console.log('DRY RUN: would create a Reliability Engineer role with digital_twin.manage and');
    console.log('plant-scoped read-only geometry grants for existing maintenance roles.');
    console.log('No user is enrolled automatically. Set --apply to provision.');
    return;
  }
  const url=process.env.DATABASE_URL?.trim();
  if(!url||!/^postgres(?:ql)?:\/\//i.test(url)){
    throw Error('An explicit PostgreSQL DATABASE_URL is required; refusing to modify a default database');
  }
  const db=new PrismaClient({adapter:createAdapter(url)});
  try{
    await db.$transaction(async tx=>{
      const role=await tx.role.upsert({
        where:{slug:'reliability_engineer'},
        update:{},
        create:{
          slug:'reliability_engineer',name:'Reliability Engineer',
          description:'Controls authorized OEM CAD, physical machine scans and independent visual-mapping review',
          level:75,isSystem:false,
        },
      });
      for(const slug of RELIABILITY_ENGINEER_PERMISSIONS){
        const permission=await tx.permission.upsert({
          where:{slug},update:{},create:readablePermission(slug),
        });
        await tx.rolePermission.upsert({
          where:{roleId_permissionId:{roleId:role.id,permissionId:permission.id}},
          update:{},create:{roleId:role.id,permissionId:permission.id},
        });
      }
      for(const slug of READ_ONLY_GEOMETRY_ROLES){
        const existing=await tx.role.findUnique({where:{slug},select:{id:true}});
        if(!existing)continue;
        for(const permissionSlug of GEOMETRY_VIEW_PERMISSIONS){
          const permission=await tx.permission.upsert({
            where:{slug:permissionSlug},update:{},create:readablePermission(permissionSlug),
          });
          await tx.rolePermission.upsert({
            where:{roleId_permissionId:{
              roleId:existing.id,permissionId:permission.id,
            }},
            update:{},create:{roleId:existing.id,permissionId:permission.id},
          });
        }
      }
    });
    console.log('Provisioned scoped reliability-engineer role and read-only maintenance geometry grants.');
    console.log('No user was assigned. Use the administrative Team/Access screen to assign engineers per plant.');
  }finally{
    await db.$disconnect();
  }
}

main().catch(error=>{
  console.error('Reliability-engineer role provisioning failed:',error instanceof Error?error.message:'Unknown error');
  process.exitCode=1;
});
