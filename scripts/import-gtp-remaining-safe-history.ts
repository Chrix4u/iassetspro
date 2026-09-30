import fs from 'node:fs';
import { Prisma } from '@prisma/client';
import { db } from '../src/lib/db';

type Row=[string,string,string,string,string,string,string,string,string,string,string,string,string,string,string,string];
const payload=JSON.parse(fs.readFileSync('/tmp/gtp_remaining.json','utf8')) as {sha256:string;rows:Row[]};
const EXPECTED_SHA='b05a023b0486693ae54186f985e9a04b175571fabfc7a17f1b3963188a7967cc';
const norm=(v:unknown)=>String(v??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const parseDate=(v:string)=>{ if(!String(v||'').trim()) return undefined; const s=String(v).trim(); const iso=/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)?s.replace(' ','T')+'Z':s; const d=new Date(iso); return Number.isNaN(d.getTime())?undefined:d; };
const priority=(v:string)=>Number(v)===1?'critical':Number(v)===2?'high':'medium';
const mappedStatus=(r:Row)=>{
  const explicit=norm(r[8]).replace(/ /g,'_');
  if(explicit==='completed') return 'closed';
  if(explicit==='in_progress'||explicit==='inprogress') return 'in_progress';
  if(explicit==='pending') return 'requested';
  if(parseDate(r[9])) return 'closed';
  if(parseDate(r[7])) return 'in_progress';
  return 'requested';
};

async function main(){
 if(payload.sha256!==EXPECTED_SHA) throw new Error('Source SHA mismatch');
 if(payload.rows.length!==2396) throw new Error('Expected 2396 non-breakdown rows');
 const plant=await db.plant.findUnique({where:{code:'GTP-UAT'},select:{id:true,code:true,name:true}});
 const admin=await db.user.findUnique({where:{username:'admin'},select:{id:true}});
 if(!plant||!admin) throw new Error('Required GTP-UAT plant/admin missing');

 const assets=await db.asset.findMany({where:{plantId:plant.id,category:{code:'GTP-MACHINE-UAT'},isActive:true},select:{id:true,assetTag:true,name:true,specification:true}});
 if(assets.length!==152) throw new Error(`Expected 152 canonical GTP assets, found ${assets.length}`);
 type A={id:string;assetTag:string;name:string;priority:number|null};
 const byCode=new Map<string,A[]>();
 for(const a of assets){
   let s:any={}; try{s=JSON.parse(a.specification||'{}')}catch{}
   const code=String(s.legacyCode||'').trim(); if(!code) continue;
   const item:A={id:a.id,assetTag:a.assetTag,name:a.name,priority:Number.isFinite(Number(s.legacyPriority))?Number(s.legacyPriority):null};
   const arr=byCode.get(code)||[]; arr.push(item); byCode.set(code,arr);
 }
 const resolve=(r:Row):A|null=>{
   const code=String(r[4]||'').trim(); if(!code) return null;
   const candidates=byCode.get(code)||[]; if(!candidates.length) return null; if(candidates.length===1) return candidates[0];
   const exact=candidates.filter(a=>norm(a.name)===norm(r[5])&&Number(r[10])===a.priority); if(exact.length===1) return exact[0];
   const byName=candidates.filter(a=>norm(a.name)===norm(r[5])); return byName.length===1?byName[0]:null;
 };

 const blocked:any[]=[]; const ready:any[]=[];
 for(let i=0;i<payload.rows.length;i++){
   const r=payload.rows[i]; const code=String(r[4]||'').trim(); const reportedAt=parseDate(r[2]); const asset=resolve(r);
   const reasons:string[]=[];
   if(!code) reasons.push('missing_machine_code'); else if(!asset) reasons.push('unresolved_machine_code');
   if(!reportedAt) reasons.push('missing_or_invalid_reported_time');
   if(reasons.length){ blocked.push({wo:r[0],reasons}); continue; }
   const actualStart=parseDate(r[7]), actualEnd=parseDate(r[9]), status=mappedStatus(r);
   const timestampWarnings:string[]=[];
   if(String(r[7]||'').trim()&&!actualStart) timestampWarnings.push('invalid_start_time');
   if(String(r[9]||'').trim()&&!actualEnd) timestampWarnings.push('invalid_completion_time');
   const provenance=JSON.stringify({
     source:'GTP historical workbook',sourceSha256:payload.sha256,reportUatSubset:'non_breakdown',
     legacyWorkOrderNo:r[0],legacyWorkOrderType:r[1],legacyEquipmentCode:code,legacyEquipmentDescription:r[5]||null,
     legacyPriority:r[10]||null,rawReportedAt:r[2]||null,rawWorkStartedAt:r[7]||null,rawWorkCompletedAt:r[9]||null,
     legacyWorkStatus:r[8]||null,technicianReport:r[11]||null,plannedBy:r[12]||null,assignedTo:r[13]||null,
     requestedBy:r[14]||null,department:r[15]||null,timestampWarnings,sourceIndex:i+1
   });
   ready.push({r,asset,reportedAt,actualStart,actualEnd,status,provenance});
 }
 if(ready.length!==2376||blocked.length!==20) throw new Error(`Audit gate mismatch: ready=${ready.length}, blocked=${blocked.length}`);

 const woNumbers=ready.map(x=>`GTP-WO-${x.r[0]}`), mrNumbers=ready.map(x=>`GTP-MR-${x.r[0]}`);
 const [woCollisions,mrCollisions]=await Promise.all([
   db.workOrder.count({where:{woNumber:{in:woNumbers}}}),
   db.maintenanceRequest.count({where:{requestNumber:{in:mrNumbers}}})
 ]);
 if(woCollisions||mrCollisions) throw new Error(`Historical identity collision: WOs=${woCollisions}, MRs=${mrCollisions}`);

 const imported=await db.$transaction(async tx=>{
   const mrs=await tx.maintenanceRequest.createManyAndReturn({
     data:ready.map(x=>({
       requestNumber:`GTP-MR-${x.r[0]}`, title:x.r[3]||`Historical ${x.r[1]} - ${x.asset.name}`,
       description:x.provenance, priority:priority(x.r[10]), category:x.r[6]||undefined,
       status:x.status==='closed'?'converted':'pending', workflowStatus:x.status==='closed'?'closed':'work_order_created',
       machineDownStatus:false, assetId:x.asset.id, assetName:x.r[5]||x.asset.name, requestedBy:admin.id,
       plantId:plant.id, createdAt:x.reportedAt
     })), select:{id:true,requestNumber:true}
   });
   if(mrs.length!==ready.length) throw new Error('MR insert count mismatch');
   const mrByNo=new Map(mrs.map(m=>[m.requestNumber,m.id]));
   const wos=await tx.workOrder.createManyAndReturn({
     data:ready.map(x=>({
       woNumber:`GTP-WO-${x.r[0]}`, title:x.r[3]||`Historical ${x.r[1]} - ${x.asset.name}`,
       description:x.provenance, type:norm(x.r[1])==='preventive'?'preventive':'corrective',
       priority:priority(x.r[10]), status:x.status, maintenanceRequestId:mrByNo.get(`GTP-MR-${x.r[0]}`)!,
       assetId:x.asset.id, assetName:x.r[5]||x.asset.name, plantId:plant.id, plannerId:admin.id,
       tradeActivity:x.r[6]||undefined, actualStart:x.actualStart, actualEnd:x.actualEnd,
       notes:x.provenance, createdAt:x.reportedAt
     })), select:{id:true,woNumber:true,maintenanceRequestId:true}
   });
   if(wos.length!==ready.length) throw new Error('WO insert count mismatch');

   const links=wos.map(w=>({maintenanceRequestId:w.maintenanceRequestId!,workOrderId:w.id}));
   for(let i=0;i<links.length;i+=400){
     const chunk=links.slice(i,i+400);
     const values=Prisma.join(chunk.map(x=>Prisma.sql`(${x.maintenanceRequestId},${x.workOrderId})`));
     await tx.$executeRaw(Prisma.sql`UPDATE "maintenance_requests" mr SET "workOrderId"=v.work_order_id FROM (VALUES ${values}) v(maintenance_request_id,work_order_id) WHERE mr.id=v.maintenance_request_id`);
   }

   await tx.auditLog.createMany({data:wos.map(w=>({
     userId:admin.id,action:'historical_import',entityType:'work_order',entityId:w.id,
     newValues:JSON.stringify({woNumber:w.woNumber,sourceSha256:payload.sha256,batch:'gtp_remaining_safe',migrationPlantId:plant.id}),
     plantId:plant.id
   }))});

   const ids=wos.map(w=>w.id);
   const [verifyWos,verifyMrs,verifyAudits]=await Promise.all([
     tx.workOrder.count({where:{id:{in:ids},plantId:plant.id}}),
     tx.maintenanceRequest.count({where:{requestNumber:{in:mrNumbers},plantId:plant.id}}),
     tx.auditLog.count({where:{entityId:{in:ids},action:'historical_import',plantId:plant.id}})
   ]);
   if(verifyWos!==ready.length||verifyMrs!==ready.length||verifyAudits!==ready.length) throw new Error('Commit verification mismatch');
   return {workOrders:verifyWos,maintenanceRequests:verifyMrs,auditRows:verifyAudits};
 },{maxWait:10000,timeout:120000,isolationLevel:Prisma.TransactionIsolationLevel.Serializable});

 const result={sourceSha256:payload.sha256,plant,ready:ready.length,blocked:blocked.length,blockedRows:blocked,...imported};
 fs.writeFileSync('/tmp/gtp_remaining_import_result.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify(result,null,2));
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>db.$disconnect());