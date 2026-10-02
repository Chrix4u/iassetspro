import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) throw new Error('DATABASE_URL must point to PostgreSQL');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db = new PrismaClient({ adapter: createAdapter(process.env.DATABASE_URL) });

const TARGET_ASSET_TAG='UAT-GTP-314-1-001';
const PREFIX='GTP-MERC';
const PROVENANCE='Auto-mapped from GTP Mercerizer historical work-order title by conservative UAT commissioning rule; verify against OEM/master-data before production approval.';

const RULES=[
  {key:'caustic-mangle-1',code:'CMP-CAUSTIC-MANGLE-1',re:/1st caustic mangle|first caustic mangle/i},
  {key:'caustic-mangle-2',code:'CMP-CAUSTIC-MANGLE-2',re:/2nd caustic mangle|second caustic mangle|mangle\s*2/i},
  {key:'weak-caustic-pump',code:'CMP-WEAK-CAUSTIC-PUMP',re:/weak caustic.*pump|pump.*weak caustic/i},
  {key:'weak-caustic-motor',code:'CMP-WEAK-CAUSTIC-MOTOR',re:/weak caustic.*motor|motor.*weak caustic/i},
  {key:'caustic-circulation',code:'CMP-CAUSTIC-PUMP',re:/caustic circulation pump|circulation pump|main supply caustic pump|caustic supply pump/i},
  {key:'caustic-filter',code:'CMP-CAUSTIC-FILTER',re:/caustic filter/i},
  {key:'entrance-caustic-pump',code:'CMP-ENTRANCE-CAUSTIC-PUMP',re:/entrance caustic pump/i},
  {key:'wash-1',code:'SUB-WASH-1',re:/wash(?:er|ing)?(?: tank)?\s*#?\s*1|washer 1/i},
  {key:'wash-2',code:'SUB-WASH-2',re:/wash(?:er|ing)?(?: tank)?\s*#?\s*2|washer 2/i},
  {key:'cascade',code:'SUB-CASCADE',re:/cascade/i},
  {key:'suction',code:'SUB-SUCTION',re:/suction|vacuum/i},
  {key:'chain',code:'SUB-STENTER-CHAIN',re:/stenter chain|chain opener|loose[d]? chain|loosed chain|\\bchain\\b/i},
  {key:'guider',code:'CMP-GUIDER',re:/guider|guide/i},
  {key:'straightener',code:'CMP-STRAIGHTENER',re:/straightner|straightener|straighner/i},
  {key:'plaiter',code:'CMP-PLAITER',re:/plaiter/i},
  {key:'compensator',code:'ASM-TENSION',re:/compensator|balancer/i},
  {key:'water-mangle',code:'CMP-WATER-MANGLE',re:/water mangle|water magle/i},
  {key:'main-drive',code:'CMP-MAIN-DRIVE',re:/main drive|faulty drive|machine unable to start|stoppage/i},
  {key:'motor',code:'CMP-MAIN-MOTOR',re:/\bmotor\b/i},
  {key:'gearbox',code:'SUB-GEARBOX',re:/gear ?box/i},
  {key:'steam',code:'SUB-STEAM',re:/steam|condensate|trap/i},
  {key:'lagoon',code:'SUB-LAGOON',re:/lagoon/i},
  {key:'pneumatic',code:'SUB-PNEU',re:/air leakage|air pressure|pneumatic/i},
  {key:'hydraulic',code:'SUB-HYD',re:/hydrolic|hydraulic|oil leakage/i},
  {key:'controls',code:'CMP-OP-PANEL',re:/control panel|operational panel|suction knob|controller|speed control|e-stop|temperature control|main panel/i},
  {key:'flow',code:'INS-FLOW',re:/flow meter|flow controller|concentration control|caustic flow control/i},
  {key:'pressure',code:'INS-PRESSURE',re:/vacuum gauge|pressure/i},
  {key:'sewing',code:'CMP-SEWING',re:/sewing|pegasus|needle/i},
];

function fullCode(code:string){return `${PREFIX}-${code}`;}

async function main(){
 const asset=await db.asset.findUnique({where:{assetTag:TARGET_ASSET_TAG},select:{id:true,assetTag:true,name:true}});
 if(!asset) throw new Error(`${TARGET_ASSET_TAG} is missing`);
 const components=await db.componentRegistry.findMany({where:{assetId:asset.id,componentCode:{in:RULES.map(r=>fullCode(r.code))}},select:{id:true,componentCode:true}});
 const map=new Map(components.map(c=>[c.componentCode,c.id]));
 for(const rule of RULES) if(!map.has(fullCode(rule.code))) throw new Error(`Missing required component ${fullCode(rule.code)}`);
 const workOrders=await db.workOrder.findMany({where:{assetId:asset.id},select:{id:true,woNumber:true,title:true}});
 let matched=0; let links=0; const counts:Record<string,number>={};
 await db.$transaction(async(tx)=>{
   for(const wo of workOrders){
     const title=wo.title||''; const matches=RULES.filter(r=>r.re.test(title));
     if(matches.length===0) continue; matched+=1;
     for(const rule of matches){
       await tx.workOrderComponent.upsert({
         where:{workOrderId_componentRegistryId:{workOrderId:wo.id,componentRegistryId:map.get(fullCode(rule.code))!}},
         update:{notes:`${PROVENANCE} Rule=${rule.key}; source title: ${title}`},
         create:{workOrderId:wo.id,componentRegistryId:map.get(fullCode(rule.code))!,notes:`${PROVENANCE} Rule=${rule.key}; source title: ${title}`},
       });
       links+=1; counts[rule.key]=(counts[rule.key]||0)+1;
     }
   }
 });
 console.log(JSON.stringify({asset,totalWorkOrders:workOrders.length,matchedWorkOrders:matched,unmatchedWorkOrders:workOrders.length-matched,upsertedLinks:links,ruleLinks:counts,provenance:PROVENANCE},null,2));
}

main().catch(e=>{console.error(e);process.exit(1)}).finally(async()=>db.$disconnect());
