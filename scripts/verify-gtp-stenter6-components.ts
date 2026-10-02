import { PrismaClient } from '@prisma/client';
if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) throw new Error('DATABASE_URL must point to PostgreSQL');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db=new PrismaClient({adapter:createAdapter(process.env.DATABASE_URL)});
const TAG='UAT-GTP-340-6-008',PREFIX='GTP-ST6';
(async()=>{const asset=await db.asset.findUnique({where:{assetTag:TAG},select:{id:true,assetTag:true,name:true,plantId:true}});if(!asset)throw new Error('Stenter 6 missing');
 const rows=await db.componentRegistry.findMany({where:{assetId:asset.id,componentCode:{startsWith:PREFIX}},select:{id:true,parentId:true,componentCode:true,notes:true,componentType:true}});const ids=new Set(rows.map(r=>r.id));const roots=rows.filter(r=>!r.parentId);const orphans=rows.filter(r=>r.parentId&&!ids.has(r.parentId));const byType=rows.reduce<Record<string,number>>((a,r)=>{a[r.componentType]=(a[r.componentType]||0)+1;return a},{});const disclosed=rows.filter(r=>r.notes?.includes('historical maintenance titles'));
 const checks={nodeCount:rows.length===56,rootCount:roots.length===9,noOrphans:orphans.length===0,templateDisclosure:disclosed.length===rows.length,assemblies:byType.assembly===9};
 const failed=Object.entries(checks).filter(([,v])=>!v).map(([k])=>k);console.log(JSON.stringify({asset,nodeCount:rows.length,rootCount:roots.length,orphanCount:orphans.length,byType,checks,status:failed.length?'FAIL':'PASS',failed},null,2));if(failed.length)process.exitCode=1;await db.$disconnect();
})().catch(async e=>{console.error(e);await db.$disconnect();process.exit(1)});
