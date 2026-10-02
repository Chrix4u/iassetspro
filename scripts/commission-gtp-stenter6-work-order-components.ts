import { PrismaClient } from '@prisma/client';
if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) throw new Error('DATABASE_URL must point to PostgreSQL');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db=new PrismaClient({adapter:createAdapter(process.env.DATABASE_URL)});
const TAG='UAT-GTP-340-6-008',PREFIX='GTP-ST6';
const PROVENANCE='Auto-mapped from GTP Stenter 6 historical work-order title by conservative UAT commissioning rule; verify against OEM/master-data before production approval.';
const RULES=[
 {key:'brush',code:'PRT-PIN-BRUSH',re:/brush|pin brush|metal brush|iron brush|woodin brush|robber brush|rubber brush|fibre brush/i},
 {key:'feeler',code:'CMP-FEELER',re:/feeler head|filler head/i},
 {key:'guider',code:'CMP-GUIDER',re:/foxwell|cloth guider/i},
 {key:'yard',code:'INS-YARD',re:/yards? counter/i},
 {key:'chain',code:'PRT-CHAIN',re:/stenter chain|loose stenter chain|shorten stenter chain/i},
 {key:'clip-shoe',code:'PRT-CLIP-SHOE',re:/clip shoes?|conveyor shoes?|chain conveyor shoes?/i},
 {key:'chain-cylinder',code:'CMP-CHAIN-CYL',re:/chain cylinder/i},
 {key:'conveyor-gear',code:'CMP-CONV-GEAR',re:/conveyor gear ?box|conveyor gear box wheels|chain conveyor gearbox/i},
 {key:'mangle',code:'CMP-MANGLE',re:/\bmangle\b|squeezing mangle/i},
 {key:'mangle-bearing',code:'PRT-MANGLE-BEAR',re:/mangle bearing/i},
 {key:'squeeze-bowl',code:'CMP-SQ-BOWL',re:/squeezing bowl/i},
 {key:'burner',code:'CMP-BURNERS',re:/burner|burnner/i},
 {key:'burner-control',code:'INS-BURN-CTRL',re:/burner knob|burner control/i},
 {key:'fan',code:'CMP-FANS',re:/circulating fan|faulty fan/i},
 {key:'chamber',code:'SUB-CHAMBER',re:/drying chamber|chamber door|heat protector|\bsieve\b/i},
 {key:'gearbox',code:'CMP-MAIN-GEAR',re:/main gear ?box|main gearbox|gear box seat/i},
 {key:'shaft',code:'CMP-MAIN-SHAFT',re:/main drive shaft/i},
 {key:'shaft-bearing',code:'PRT-SHAFT-BEAR',re:/drive shaft.*bearing|infeed bearings/i},
 {key:'air',code:'SUB-PNEU',re:/air leakage|air supply line|air cleaning|rubber hose/i},
 {key:'hyd-gauge',code:'CMP-HYD-GAUGE',re:/hydraulic gauge/i},
 {key:'gas',code:'CMP-GAS-LINE',re:/gas leakage/i},
 {key:'batch-frame',code:'CMP-BATCH-FRAME',re:/batching frames?/i},
 {key:'batch-arm',code:'CMP-BATCH-ARM',re:/batch arm roller/i},
 {key:'bed',code:'CMP-BED',re:/stenter bed|bed setting/i},
 {key:'lifter',code:'CMP-LIFTER',re:/\blifter\b/i},
 {key:'sewing',code:'CMP-SEWING',re:/sewing machine|sawing machine|merrow|pegasus/i},
 {key:'needle',code:'PRT-SEW-NEEDLE',re:/needle/i},
 {key:'sewing-cable',code:'PRT-SEW-CABLE',re:/sewing machine cable/i},
 {key:'plug',code:'CMP-PLUG',re:/faulty plug/i},
 {key:'electrical',code:'PRT-ELEC-CABLE',re:/electrical cables?/i},
 {key:'mahlo',code:'CMP-MAHLO',re:/mahlo/i},
 {key:'disk-outfeed',code:'CMP-DISK-OUT',re:/disk out ?feed/i},
 {key:'grip-tape',code:'CMP-GRIP-TAPE',re:/grip tape/i},
 {key:'ball-valve',code:'CMP-BALL-VALVE',re:/ball valve/i},
];
function fullCode(c:string){return `${PREFIX}-${c}`;}
async function main(){const asset=await db.asset.findUnique({where:{assetTag:TAG},select:{id:true,assetTag:true,name:true}});if(!asset)throw new Error('Stenter 6 missing');
 const components=await db.componentRegistry.findMany({where:{assetId:asset.id,componentCode:{in:RULES.map(r=>fullCode(r.code))}},select:{id:true,componentCode:true}});const map=new Map(components.map(c=>[c.componentCode,c.id]));for(const r of RULES)if(!map.has(fullCode(r.code)))throw new Error(`Missing ${fullCode(r.code)}`);
 const wos=await db.workOrder.findMany({where:{assetId:asset.id},select:{id:true,title:true}});let matched=0,links=0;const counts:Record<string,number>={};
 await db.$transaction(async tx=>{for(const wo of wos){const title=wo.title||'';const ms=RULES.filter(r=>r.re.test(title));if(!ms.length)continue;matched++;for(const r of ms){await tx.workOrderComponent.upsert({where:{workOrderId_componentRegistryId:{workOrderId:wo.id,componentRegistryId:map.get(fullCode(r.code))!}},update:{notes:`${PROVENANCE} Rule=${r.key}; source title: ${title}`},create:{workOrderId:wo.id,componentRegistryId:map.get(fullCode(r.code))!,notes:`${PROVENANCE} Rule=${r.key}; source title: ${title}`}});links++;counts[r.key]=(counts[r.key]||0)+1;}}});
 console.log(JSON.stringify({asset,totalWorkOrders:wos.length,matchedWorkOrders:matched,coveragePct:Number((matched/wos.length*100).toFixed(1)),upsertedLinks:links,ruleLinks:counts,provenance:PROVENANCE},null,2));
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(async()=>db.$disconnect());
