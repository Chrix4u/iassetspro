import { PrismaClient } from '@prisma/client';
if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) throw new Error('DATABASE_URL must point to PostgreSQL');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db=new PrismaClient({adapter:createAdapter(process.env.DATABASE_URL)});
const TAG='UAT-GTP-350-2-012';
const TITLE=/\bR\.?S\.?P\.?\s*2\b|Rotary screen printing 2|\bRSR\s*2\b/i;
const RULES=[
 {key:'printing',code:'GTP-RSP2-ASM-PRINT',re:/printing head|screen head|head\s*(no|number|#|\d)|screen washer|screen width|screen holder|glue wiper|magnetic beam|position\s*\d|misfit|diagonal adjustment|vertical adjustment/i},
 {key:'ink-pump',code:'GTP-RSP2-CMP-INKPUMP',re:/colou?r pump|pump switch|pump side/i},
 {key:'dryer',code:'GTP-RSP2-ASM-DRYER',re:/burner|dryer|drying chamber|heater|gas leakage/i},
 {key:'web-handling',code:'GTP-RSP2-ASM-WEB',re:/conveyor|convayor|belt|blanket|grip tape|roller|out\s*feed|infeed cloth tensioner|cloth tensioner|sewing machine|needle/i},
 {key:'drive',code:'GTP-RSP2-ASM-DRIVE',re:/main drive|drive not responding|conveyor drive|motor|shaft|chain/i},
 {key:'controls',code:'GTP-RSP2-ASM-CTRL',re:/electrical|error(?:\s+code)?\s*\d+|keypad|counter|yards counter|switch|lighting|panel|supply cable/i},
 {key:'exhaust-fan',code:'GTP-RSP2-CMP-EXFAN',re:/circulating fan|circulation fan|circular fan|ceiling fan|\bfan\b|exhaust|chimney|funnel/i},
 {key:'pneumatics',code:'GTP-RSP2-ASM-PNEU',re:/air leakage|air laeakage|air supply|air connection|cylinder|pneumatic|hose/i},
] as const;
const MARKER='Auto-mapped from GTP historical RSP2 work-order title by conservative UAT commissioning rule; verify during OEM/master-data review.';
async function main(){const asset=await db.asset.findUnique({where:{assetTag:TAG},select:{id:true,assetTag:true,name:true}});if(!asset)throw new Error('RSP2 missing');
const comps=await db.componentRegistry.findMany({where:{assetId:asset.id,componentCode:{in:RULES.map(r=>r.code)}},select:{id:true,componentCode:true}});const map=new Map(comps.map(c=>[c.componentCode,c.id]));for(const r of RULES)if(!map.has(r.code))throw new Error(`Missing ${r.code}`);
const wos=await db.workOrder.findMany({where:{assetId:asset.id},select:{id:true,title:true}});let eligible=0,matched=0,links=0;const counts:Record<string,number>={};
await db.$transaction(async tx=>{for(const wo of wos){const title=wo.title||'';if(!TITLE.test(title))continue;eligible++;const ms=RULES.filter(r=>r.re.test(title));if(!ms.length)continue;matched++;for(const r of ms){await tx.workOrderComponent.upsert({where:{workOrderId_componentRegistryId:{workOrderId:wo.id,componentRegistryId:map.get(r.code)!}},update:{notes:`${MARKER} Rule=${r.key}; source title: ${title}`},create:{workOrderId:wo.id,componentRegistryId:map.get(r.code)!,notes:`${MARKER} Rule=${r.key}; source title: ${title}`}});links++;counts[r.key]=(counts[r.key]||0)+1;}}});
console.log(JSON.stringify({asset,totalWorkOrders:wos.length,eligibleTitles:eligible,matchedWorkOrders:matched,coveragePct:eligible?Number((matched/eligible*100).toFixed(1)):0,upsertedLinks:links,ruleLinks:counts},null,2));}
main().catch(e=>{console.error(e);process.exit(1)}).finally(async()=>db.$disconnect());
