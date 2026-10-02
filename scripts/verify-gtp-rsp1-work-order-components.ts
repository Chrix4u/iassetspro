import { PrismaClient } from '@prisma/client';
if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) throw new Error('DATABASE_URL must point to PostgreSQL');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db=new PrismaClient({adapter:createAdapter(process.env.DATABASE_URL)});
const TAG='UAT-GTP-350-1-011',MARKER='Auto-mapped from GTP historical RSP1 work-order title by conservative UAT commissioning rule';
(async()=>{const asset=await db.asset.findUnique({where:{assetTag:TAG},select:{id:true,assetTag:true,name:true}});if(!asset)throw new Error('RSP1 missing');
const total=await db.workOrder.count({where:{assetId:asset.id}});const links=await db.workOrderComponent.findMany({where:{workOrder:{assetId:asset.id},notes:{contains:MARKER}},select:{workOrderId:true}});const mapped=new Set(links.map(l=>l.workOrderId));
const checks={workOrderCount:total===100,meaningfulCoverage:mapped.size/total>=0.60,meaningfulLinks:links.length>=65};const failed=Object.entries(checks).filter(([,v])=>!v).map(([k])=>k);
console.log(JSON.stringify({asset,totalWorkOrders:total,mappedWorkOrders:mapped.size,totalLinks:links.length,coveragePct:Number((mapped.size/total*100).toFixed(1)),checks,status:failed.length?'FAIL':'PASS',failed},null,2));if(failed.length)process.exitCode=1;await db.$disconnect();
})().catch(async e=>{console.error(e);await db.$disconnect();process.exit(1)});
