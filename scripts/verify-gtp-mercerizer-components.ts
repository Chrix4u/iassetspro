import { PrismaClient } from '@prisma/client';
if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) throw new Error('DATABASE_URL must point to PostgreSQL');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db = new PrismaClient({ adapter: createAdapter(process.env.DATABASE_URL) });
const TAG='UAT-GTP-314-1-001', PREFIX='GTP-MERC';
(async()=>{
 const asset=await db.asset.findUnique({where:{assetTag:TAG},select:{id:true,assetTag:true,name:true,plantId:true}}); if(!asset)throw new Error('Mercerizer missing');
 const rows=await db.componentRegistry.findMany({where:{assetId:asset.id,componentCode:{startsWith:PREFIX}},select:{id:true,parentId:true,componentCode:true,notes:true}});
 const ids=new Set(rows.map(r=>r.id)); const roots=rows.filter(r=>!r.parentId); const orphans=rows.filter(r=>r.parentId&&!ids.has(r.parentId));
 const disclosed=rows.filter(r=>r.notes?.includes('historical maintenance titles'));
 const required=['GTP-MERC-ASM-WEB','GTP-MERC-ASM-CAUSTIC','GTP-MERC-ASM-WASH','GTP-MERC-ASM-TENSION','GTP-MERC-ASM-DRIVE','GTP-MERC-ASM-UTIL','GTP-MERC-ASM-FLUID','GTP-MERC-ASM-CTRL'];
 const codes=new Set(rows.map(r=>r.componentCode));
 const checks={nodeCount:rows.length===68,rootCount:roots.length===8,noOrphans:orphans.length===0,templateDisclosure:disclosed.length===rows.length,requiredRoots:required.every(c=>codes.has(c))};
 const failed=Object.entries(checks).filter(([,v])=>!v).map(([k])=>k);
 console.log(JSON.stringify({asset,nodeCount:rows.length,rootCount:roots.length,orphanCount:orphans.length,checks,status:failed.length?'FAIL':'PASS',failed},null,2)); if(failed.length)process.exitCode=1; await db.$disconnect();
})().catch(async e=>{console.error(e);await db.$disconnect();process.exit(1)});
