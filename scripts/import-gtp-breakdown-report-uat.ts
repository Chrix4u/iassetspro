import fs from 'node:fs';
import { Prisma } from '@prisma/client';
import { db } from '../src/lib/db';

type Job = [string,string,string,string,string,string,string,string,string,string,string];
type Machine = [string,string,string,string];

const payload = JSON.parse(fs.readFileSync('/tmp/gtp_bd.json','utf8')) as {sha256:string;jobs:Job[];machines:Machine[]};
const norm=(v:unknown)=>String(v??'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const asDate=(v:string)=> { if(!v) return undefined; const d=new Date(v.endsWith('Z') ? v : v+'Z'); return Number.isNaN(d.getTime()) ? undefined : d; };
const priority=(v:string)=> Number(v)===1?'critical':Number(v)===2?'high':Number(v)===3?'medium':'medium';
const status=(j:Job)=> {
  const s=norm(j[8]).replace(/ /g,'_');
  if(s==='completed') return 'closed';
  if(s==='in_progress'||s==='inprogress') return 'in_progress';
  if(s==='pending') return 'requested';
  if(j[9]) return 'closed';
  if(j[7]) return 'in_progress';
  return 'requested';
};
const criticality=(v:string)=>Number(v)===1?'critical':Number(v)===2?'high':'medium';

async function main(){
  if(payload.jobs.length!==411) throw new Error('Expected 411 breakdown rows');
  const plant=await db.plant.findUnique({where:{code:'GTP-UAT'},select:{id:true,code:true,name:true}});
  if(!plant) throw new Error('GTP-UAT plant missing');
  const admin=await db.user.findUnique({where:{username:'admin'},select:{id:true,fullName:true}});
  if(!admin) throw new Error('admin user missing');

  const [existingWos,existingMrs]=await Promise.all([
    db.workOrder.count({where:{woNumber:{startsWith:'GTP-WO-'}}}),
    db.maintenanceRequest.count({where:{requestNumber:{startsWith:'GTP-MR-'}}}),
  ]);
  if(existingWos||existingMrs) throw new Error(`Historical GTP identities already exist: WOs=${existingWos}, MRs=${existingMrs}`);

  // Remove only the redundant assets created by the aborted staging pass.
  // The canonical 152-row workbook machine master already exists in GTP-UAT.
  const stagingCategory=await db.assetCategory.findUnique({where:{code:'GTP-LEGACY-MACHINE-UAT'},select:{id:true}});
  if(stagingCategory){
    await db.asset.deleteMany({where:{plantId:plant.id,categoryId:stagingCategory.id}});
    await db.assetCategory.delete({where:{id:stagingCategory.id}});
  }

  const canonicalAssets=await db.asset.findMany({
    where:{plantId:plant.id,category:{code:'GTP-MACHINE-UAT'},isActive:true},
    select:{id:true,assetTag:true,name:true,specification:true},
  });
  if(canonicalAssets.length!==152) throw new Error(`Expected 152 canonical GTP machine-master assets, found ${canonicalAssets.length}`);

  type LegacyAsset={id:string;assetTag:string;name:string;legacyPriority:number|null};
  const assetsByLegacyCode=new Map<string,LegacyAsset[]>();
  for(const a of canonicalAssets){
    let spec:any={}; try{spec=JSON.parse(a.specification||'{}')}catch{}
    const code=String(spec.legacyCode||'').trim(); if(!code) continue;
    const row:LegacyAsset={id:a.id,assetTag:a.assetTag,name:a.name,legacyPriority:Number.isFinite(Number(spec.legacyPriority))?Number(spec.legacyPriority):null};
    const arr=assetsByLegacyCode.get(code)||[]; arr.push(row); assetsByLegacyCode.set(code,arr);
  }

  const jobsByCode=new Map<string,Job[]>();
  for(const j of payload.jobs){
    const code=String(j[4]||'').trim(); if(!code) continue;
    const arr=jobsByCode.get(code)||[]; arr.push(j); jobsByCode.set(code,arr);
  }

  const selectedAsset=new Map<string,LegacyAsset>();
  for(const [code,jobs] of jobsByCode){
    const candidates=assetsByLegacyCode.get(code)||[];
    if(!candidates.length) throw new Error(`No canonical GTP asset for legacy code ${code}`);
    let chosen=candidates[0];
    if(candidates.length>1){
      const exact=candidates.filter(a=>jobs.some(j=>norm(j[5])===norm(a.name) && (!j[10]||Number(j[10])===a.legacyPriority)));
      if(exact.length===1) chosen=exact[0];
      else {
        const byName=candidates.filter(a=>jobs.some(j=>norm(j[5])===norm(a.name)));
        if(byName.length===1) chosen=byName[0];
        else throw new Error(`Ambiguous canonical GTP asset mapping for ${code}`);
      }
    }
    selectedAsset.set(code,chosen);
  }
  const assetByCode=new Map([...selectedAsset.entries()].map(([code,a])=>[code,a.id]));

  const rows=payload.jobs.map((j,index)=>{
    const woNo=String(j[0]).trim();
    const code=String(j[4]||'').trim();
    const assetId=code?assetByCode.get(code):undefined;
    const st=status(j);
    const reported=asDate(j[2]);
    if(!reported) throw new Error(`Missing reported time for WO ${woNo}`);
    const start=asDate(j[7]); const end=asDate(j[9]);
    const assetName=code?(j[5]||selectedAsset.get(code)?.name||code):'Unassigned historical work';
    const provenance=JSON.stringify({source:'GTP historical workbook',sourceSha256:payload.sha256,reportUatSubset:'breakdown',legacyWorkOrderNo:woNo,legacyEquipmentCode:code||null,legacyEquipmentDescription:j[5]||null,legacyPriority:j[10]||null,sourceIndex:index+1});
    return {j,woNo,code,assetId,assetName,st,reported,start,end,provenance};
  });

  const imported=await db.$transaction(async tx=>{
    const mrs=await tx.maintenanceRequest.createManyAndReturn({
      data:rows.map(r=>({
        requestNumber:`GTP-MR-${r.woNo}`, title:r.j[3]||`Historical breakdown - ${r.assetName}`,
        description:r.provenance, priority:priority(r.j[10]), category:r.j[6]||undefined,
        status:r.st==='closed'?'converted':'pending', workflowStatus:r.st==='closed'?'closed':'work_order_created',
        machineDownStatus:true, assetId:r.assetId, assetName:r.assetName, requestedBy:admin.id,
        plantId:plant.id, createdAt:r.reported,
      })),
      select:{id:true,requestNumber:true},
    });
    const mrByNo=new Map(mrs.map(m=>[m.requestNumber,m.id]));
    const wos=await tx.workOrder.createManyAndReturn({
      data:rows.map(r=>({
        woNumber:`GTP-WO-${r.woNo}`, title:r.j[3]||`Historical breakdown - ${r.assetName}`,
        description:r.provenance, type:'breakdown', priority:priority(r.j[10]), status:r.st,
        maintenanceRequestId:mrByNo.get(`GTP-MR-${r.woNo}`)!, assetId:r.assetId, assetName:r.assetName,
        plantId:plant.id, plannerId:admin.id, tradeActivity:r.j[6]||undefined,
        actualStart:r.start, actualEnd:r.end, notes:r.provenance, createdAt:r.reported,
      })),
      select:{id:true,woNumber:true,maintenanceRequestId:true},
    });
    const links=wos.map(w=>({maintenanceRequestId:w.maintenanceRequestId!,workOrderId:w.id}));
    for(let i=0;i<links.length;i+=200){
      const chunk=links.slice(i,i+200);
      const values=Prisma.join(chunk.map(x=>Prisma.sql`(${x.maintenanceRequestId},${x.workOrderId})`));
      await tx.$executeRaw(Prisma.sql`UPDATE "maintenance_requests" mr SET "workOrderId"=v.work_order_id FROM (VALUES ${values}) v(maintenance_request_id,work_order_id) WHERE mr.id=v.maintenance_request_id`);
    }
    const rowByWo=new Map(rows.map(r=>[`GTP-WO-${r.woNo}`,r]));
    const downtimeData=wos.flatMap(w=>{
      const r=rowByWo.get(w.woNumber)!;
      if(!r.end) return [];
      const mins=(r.end.getTime()-r.reported.getTime())/60000;
      if(!Number.isFinite(mins)||mins<0) return [];
      return [{workOrderId:w.id,assetId:r.assetId,assetName:r.assetName,downtimeStart:r.reported,downtimeEnd:r.end,durationMinutes:mins,reason:'Historical GTP breakdown: reported to completed',category:'unplanned',impactLevel:r.j[10]==='1'?'critical':r.j[10]==='2'?'high':'medium',plantId:plant.id,createdById:admin.id,createdAt:r.reported,notes:r.provenance}];
    });
    if(downtimeData.length) await tx.workOrderDowntime.createMany({data:downtimeData});
    await tx.auditLog.createMany({data:wos.map(w=>({userId:admin.id,action:'historical_report_uat_import',entityType:'work_order',entityId:w.id,newValues:JSON.stringify({woNumber:w.woNumber,sourceSha256:payload.sha256,subset:'breakdown'}),plantId:plant.id}))});
    return {mrs:mrs.length,wos:wos.length,downtimes:downtimeData.length};
  },{maxWait:10000,timeout:120000,isolationLevel:Prisma.TransactionIsolationLevel.Serializable});

  console.log(JSON.stringify({sourceSha256:payload.sha256,plant,assets:assetByCode.size,...imported},null,2));
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>db.$disconnect());