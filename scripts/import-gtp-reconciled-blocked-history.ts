import fs from 'node:fs';
import { Prisma } from '@prisma/client';
import { db } from '../src/lib/db';
type Row=[string,string,string,string,string,string,string,string,string,string,string,string,string,string,string,string];
const payload=JSON.parse(fs.readFileSync('/tmp/gtp_remaining.json','utf8')) as {sha256:string;rows:Row[]};
const audit=JSON.parse(fs.readFileSync('/tmp/gtp_remaining_audit.json','utf8')) as {blockedRows:Array<{wo:string}>};
const EXPECTED_SHA='b05a023b0486693ae54186f985e9a04b175571fabfc7a17f1b3963188a7967cc';
const norm=(v:unknown)=>String(v??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const parseDate=(v:string)=>{if(!String(v||'').trim())return undefined;const s=String(v).trim();const iso=/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)?s.replace(' ','T')+'Z':s;const d=new Date(iso);return Number.isNaN(d.getTime())?undefined:d};
const mappedStatus=(r:Row)=>{const e=norm(r[8]).replace(/ /g,'_');if(e==='completed')return'closed';if(e==='in_progress'||e==='inprogress')return'in_progress';if(e==='pending')return'requested';if(parseDate(r[9]))return'closed';if(parseDate(r[7]))return'in_progress';return'requested'};

async function main(){
 if(payload.sha256!==EXPECTED_SHA) throw new Error('Source SHA mismatch');
 const blockedNos=new Set(audit.blockedRows.map(x=>String(x.wo)));
 const rows=payload.rows.filter(r=>blockedNos.has(String(r[0])));
 if(rows.length!==20) throw new Error(`Expected 20 audited blocked rows, found ${rows.length}`);
 const plant=await db.plant.findUnique({where:{code:'GTP-UAT'},select:{id:true,code:true,name:true}});
 const admin=await db.user.findUnique({where:{username:'admin'},select:{id:true}});
 if(!plant||!admin) throw new Error('Required plant/admin missing');

 const assets=await db.asset.findMany({where:{plantId:plant.id,category:{code:'GTP-MACHINE-UAT'},isActive:true},select:{id:true,name:true,specification:true}});
 const byCode=new Map<string,Array<{id:string;name:string;priority:number|null}>>();
 for(const a of assets){let s:any={};try{s=JSON.parse(a.specification||'{}')}catch{};const code=String(s.legacyCode||'').trim();if(!code)continue;const item={id:a.id,name:a.name,priority:Number.isFinite(Number(s.legacyPriority))?Number(s.legacyPriority):null};const arr=byCode.get(code)||[];arr.push(item);byCode.set(code,arr)}
 const resolve=(r:Row)=>{const code=String(r[4]||'').trim();if(!code)return null;const c=byCode.get(code)||[];if(c.length===1)return c[0];const exact=c.filter(a=>norm(a.name)===norm(r[5])&&Number(r[10])===a.priority);if(exact.length===1)return exact[0];const n=c.filter(a=>norm(a.name)===norm(r[5]));return n.length===1?n[0]:null};

 const woNos=rows.map(r=>`GTP-WO-${r[0]}`), mrNos=rows.map(r=>`GTP-MR-${r[0]}`);
 const [wc,mc]=await Promise.all([db.workOrder.count({where:{woNumber:{in:woNos}}}),db.maintenanceRequest.count({where:{requestNumber:{in:mrNos}}})]);
 if(wc||mc) throw new Error(`Reconciled identities already exist WOs=${wc} MRs=${mc}`);

 const prepared=rows.map((r,i)=>{
   const asset=resolve(r); const rawReported=parseDate(r[2]); const start=parseDate(r[7]); const end=parseDate(r[9]);
   const reported=rawReported||start;
   if(!reported) throw new Error(`Cannot reconcile row ${r[0]}: no reported or start time`);
   const assetResolution=asset?'asset_match':'historical_unassigned';
   const reportedCorrection=!rawReported&&start?'reported_at_inferred_from_work_start':null;
   const provenance=JSON.stringify({source:'GTP historical workbook',sourceSha256:payload.sha256,assetResolution,reconciliationReason:asset?'Missing/invalid reported time reconciled from source work-start where necessary':'Legacy row has no equipment code in source workbook',reportedTimeCorrection:reportedCorrection,legacyWorkOrderNo:r[0],legacyWorkOrderType:r[1],legacyEquipmentCode:String(r[4]||'').trim()||null,legacyEquipmentDescription:r[5]||null,legacyPriority:r[10]||null,rawReportedAt:r[2]||null,rawWorkStartedAt:r[7]||null,rawWorkCompletedAt:r[9]||null,legacyWorkStatus:r[8]||null,technicianReport:r[11]||null,plannedBy:r[12]||null,assignedTo:r[13]||null,requestedBy:r[14]||null,department:r[15]||null,sourceIndex:i+1});
   return {r,asset,reported,start,end,status:mappedStatus(r),provenance,assetResolution,reportedCorrection};
 });

 const result=await db.$transaction(async tx=>{
  const mrs=await tx.maintenanceRequest.createManyAndReturn({data:prepared.map(x=>({requestNumber:`GTP-MR-${x.r[0]}`,title:x.r[3]||`Historical ${x.r[1]} work`,description:x.provenance,priority:Number(x.r[10])===1?'critical':Number(x.r[10])===2?'high':'medium',category:x.r[6]||undefined,status:x.status==='closed'?'converted':'pending',workflowStatus:x.status==='closed'?'closed':'work_order_created',machineDownStatus:false,assetId:x.asset?.id,assetName:x.asset?(x.r[5]||x.asset.name):'Unassigned historical work',requestedBy:admin.id,plantId:plant.id,createdAt:x.reported})),select:{id:true,requestNumber:true}});
  const mrBy=new Map(mrs.map(m=>[m.requestNumber,m.id]));
  const wos=await tx.workOrder.createManyAndReturn({data:prepared.map(x=>({woNumber:`GTP-WO-${x.r[0]}`,title:x.r[3]||`Historical ${x.r[1]} work`,description:x.provenance,type:norm(x.r[1])==='preventive'?'preventive':'corrective',priority:Number(x.r[10])===1?'critical':Number(x.r[10])===2?'high':'medium',status:x.status,maintenanceRequestId:mrBy.get(`GTP-MR-${x.r[0]}`)!,assetId:x.asset?.id,assetName:x.asset?(x.r[5]||x.asset.name):'Unassigned historical work',plantId:plant.id,plannerId:admin.id,tradeActivity:x.r[6]||undefined,actualStart:x.start,actualEnd:x.end,notes:x.provenance,createdAt:x.reported})),select:{id:true,woNumber:true,maintenanceRequestId:true}});
  const vals=Prisma.join(wos.map(w=>Prisma.sql`(${w.maintenanceRequestId!},${w.id})`));
  await tx.$executeRaw(Prisma.sql`UPDATE "maintenance_requests" mr SET "workOrderId"=v.work_order_id FROM (VALUES ${vals}) v(maintenance_request_id,work_order_id) WHERE mr.id=v.maintenance_request_id`);
  await tx.auditLog.createMany({data:wos.map(w=>({userId:admin.id,action:'historical_import',entityType:'work_order',entityId:w.id,newValues:JSON.stringify({woNumber:w.woNumber,sourceSha256:payload.sha256,batch:'gtp_reconciled_blocked_rows'}),plantId:plant.id}))});
  return {mrs:mrs.length,wos:wos.length};
 },{maxWait:10000,timeout:120000,isolationLevel:Prisma.TransactionIsolationLevel.Serializable});

 console.log(JSON.stringify({plant,sourceSha256:payload.sha256,reconciledRows:prepared.length,historicalUnassigned:prepared.filter(x=>x.assetResolution==='historical_unassigned').length,reportedTimeCorrections:prepared.filter(x=>x.reportedCorrection).length,...result},null,2));
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>db.$disconnect());