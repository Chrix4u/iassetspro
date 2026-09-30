import {db} from '../src/lib/db';
async function main(){
 const plant=await db.plant.findUnique({where:{code:'GTP-UAT'},select:{id:true,code:true,name:true}});
 if(!plant) throw new Error('missing plant');
 const [wos,mrs,audits,types,statuses,unassigned] = await Promise.all([
  db.workOrder.count({where:{plantId:plant.id,woNumber:{startsWith:'GTP-WO-'}}}),
  db.maintenanceRequest.count({where:{plantId:plant.id,requestNumber:{startsWith:'GTP-MR-'}}}),
  db.auditLog.count({where:{plantId:plant.id,entityType:'work_order',action:{in:['historical_import','historical_report_uat_import']}}}),
  db.workOrder.groupBy({by:['type'],where:{plantId:plant.id,woNumber:{startsWith:'GTP-WO-'}},_count:{_all:true}}),
  db.workOrder.groupBy({by:['status'],where:{plantId:plant.id,woNumber:{startsWith:'GTP-WO-'}},_count:{_all:true}}),
  db.workOrder.count({where:{plantId:plant.id,woNumber:{startsWith:'GTP-WO-'},assetId:null}})
 ]);
 console.log(JSON.stringify({plant,wos,mrs,audits,unassigned,types,statuses},null,2));
}
main().finally(()=>db.$disconnect());