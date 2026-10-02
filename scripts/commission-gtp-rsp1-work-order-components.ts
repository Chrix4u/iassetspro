import { PrismaClient } from '@prisma/client';
if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) throw new Error('DATABASE_URL must point to PostgreSQL');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db=new PrismaClient({adapter:createAdapter(process.env.DATABASE_URL)});
const TAG='UAT-GTP-350-1-011';
const TITLE=/\bR\.?S\.?P\.?\s*1\b|Rotary screen printing 1/i;
const RULES=[
 {key:'printing',code:'GTP-RSP1-ASM-PRINT',re:/printing head|screen head|faulty heads?|faulty head\b|printing parameter|screen tensioner|screen holder|squeege+|squeezer|glue wiper|washing unit|screen washing|position\s*\d|misfit|diagonal|vertical|screen width/i},
 {key:'ink-pump',code:'GTP-RSP1-CMP-INKPUMP',re:/colou?r pump|ink pump|pump switch|pump side/i},
 {key:'dryer',code:'GTP-RSP1-ASM-DRYER',re:/burner|dryer|drying chamber|heater|oven|gas leakage/i},
 {key:'web-handling',code:'GTP-RSP1-ASM-WEB',re:/conveyor|convayor|belt|blanket|grip ?tape|roller|rooler|out\s*feed|cloth tension|cloth pressing|infeed tension|sewing machine|sewing m\/c|needle/i},
 {key:'drive',code:'GTP-RSP1-ASM-DRIVE',re:/main drive|fitting drive|conveyor drive|motor|shaft|chain|gear ?box|adjust gears/i},
 {key:'controls',code:'GTP-RSP1-ASM-CTRL',re:/electrical|unstable power|error(?:\s+code)?\s*\d+|keypad|counter|switch|lighting|panel|sensor|encoder|bulbs?/i},
 {key:'exhaust-fan',code:'GTP-RSP1-CMP-EXFAN',re:/circulating fan|circulation fan|circular fan|\bfan\b|exhaust|chimney|funnel/i},
 {key:'pneumatics',code:'GTP-RSP1-ASM-PNEU',re:/air leakage|air supply|air connection|cylinder|pneumatic|hose/i},
] as const;
const MARKER='Auto-mapped from GTP historical RSP1 work-order title by conservative UAT commissioning rule; verify during OEM/master-data review.';
async function main(){const asset=await db.asset.findUnique({where:{assetTag:TAG},select:{id:true,assetTag:true,name:true}});if(!asset)throw new Error('RSP1 missing');
const comps=await db.componentRegistry.findMany({where:{assetId:asset.id,componentCode:{in:RULES.map(r=>r.code)}},select:{id:true,componentCode:true}});const map=new Map(comps.map(c=>[c.componentCode,c.id]));for(const r of RULES)if(!map.has(r.code))throw new Error(`Missing ${r.code}`);
const wos=await db.workOrder.findMany({where:{assetId:asset.id},select:{id:true,title:true}});let eligible=0,matched=0,links=0;const counts:Record<string,number>={};
await db.$transaction(async tx=>{for(const wo of wos){const title=wo.title||'';if(!TITLE.test(title))continue;eligible++;const ms=RULES.filter(r=>r.re.test(title));if(!ms.length)continue;matched++;for(const r of ms){await tx.workOrderComponent.upsert({where:{workOrderId_componentRegistryId:{workOrderId:wo.id,componentRegistryId:map.get(r.code)!}},update:{notes:`${MARKER} Rule=${r.key}; source title: ${title}`},create:{workOrderId:wo.id,componentRegistryId:map.get(r.code)!,notes:`${MARKER} Rule=${r.key}; source title: ${title}`}});links++;counts[r.key]=(counts[r.key]||0)+1;}}});
console.log(JSON.stringify({asset,totalWorkOrders:wos.length,eligibleTitles:eligible,matchedWorkOrders:matched,coveragePct:eligible?Number((matched/eligible*100).toFixed(1)):0,upsertedLinks:links,ruleLinks:counts},null,2));}
main().catch(e=>{console.error(e);process.exit(1)}).finally(async()=>db.$disconnect());
