import { PrismaClient } from '@prisma/client';
if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) throw new Error('DATABASE_URL must point to PostgreSQL');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db=new PrismaClient({adapter:createAdapter(process.env.DATABASE_URL)});
const TAG='UAT-GTP-312-1-027',PREFIX='GTP-SING';
type Node={code:string;name:string;type:'assembly'|'subassembly'|'component'|'part'|'instrument';parent?:string;criticality?:string};
const HIERARCHY:Node[]=[
{code:'ASM-INFEED',name:'Infeed, Guiding & Cloth Preparation',type:'assembly',criticality:'high'},
{code:'CMP-GUIDER',name:'Foxwell Cloth Guider',type:'component',parent:'ASM-INFEED'},
{code:'CMP-PIN',name:'Pin Roller System',type:'component',parent:'ASM-INFEED'},
{code:'CMP-BRUSH',name:'Brush Mechanism',type:'component',parent:'ASM-INFEED'},
{code:'CMP-ROLLER',name:'General Roller Train',type:'component',parent:'ASM-INFEED'},
{code:'PRT-ROLLER-BEAR',name:'Roller Bearings',type:'part',parent:'CMP-ROLLER'},

{code:'ASM-SINGE',name:'Singeing Burner & Gas System',type:'assembly',criticality:'critical'},
{code:'CMP-BURNER',name:'Singeing Burner',type:'component',parent:'ASM-SINGE',criticality:'critical'},
{code:'SUB-GAS',name:'Gas Supply & Regulation',type:'subassembly',parent:'ASM-SINGE',criticality:'critical'},
{code:'CMP-GAS-VALVE',name:'Gas / Reduction Valve',type:'component',parent:'SUB-GAS'},
{code:'PRT-GAS-LINE',name:'Gas Supply Line',type:'part',parent:'SUB-GAS'},

{code:'ASM-WET',name:'Mangle, Saturator, Washer & Water System',type:'assembly',criticality:'high'},
{code:'CMP-MANGLE',name:'Mangle',type:'component',parent:'ASM-WET'},
{code:'CMP-SAT',name:'First Saturator Mangle',type:'component',parent:'ASM-WET'},
{code:'CMP-WASH',name:'First Washer / Washing Unit',type:'component',parent:'ASM-WET'},
{code:'CMP-SPRAY',name:'Spray / Sprinkling Water Unit',type:'component',parent:'ASM-WET'},
{code:'CMP-DESIZE',name:'Desizing Tank',type:'component',parent:'ASM-WET'},
{code:'PRT-WATER-LINE',name:'Water Lines & Couplings',type:'part',parent:'ASM-WET'},
{code:'PRT-WATER-VALVE',name:'Water Valves',type:'part',parent:'ASM-WET'},

{code:'ASM-PILER',name:'Piler, Plaiter & Outfeed',type:'assembly',criticality:'high'},
{code:'CMP-PILER',name:'Piler Unit',type:'component',parent:'ASM-PILER',criticality:'high'},
{code:'PRT-PILER-CHAIN',name:'Piler Chain',type:'part',parent:'CMP-PILER'},
{code:'PRT-PILER-BELT',name:'Piler Motor Belt',type:'part',parent:'CMP-PILER'},
{code:'PRT-PILER-GEAR',name:'Piler Gear',type:'part',parent:'CMP-PILER'},
{code:'CMP-PLAIT',name:'J-Box Plaiter',type:'component',parent:'ASM-PILER'},
{code:'PRT-PLAIT-BELT',name:'J-Box Plaiter Belt',type:'part',parent:'CMP-PLAIT'},
{code:'CMP-LIFTER',name:'Pallet / Cloth Lifter',type:'component',parent:'ASM-PILER'},
{code:'CMP-POTEYE',name:'Pot-eye / Cloth Guide Eye',type:'component',parent:'ASM-PILER'},

{code:'ASM-SEW',name:'Sewing & Cloth Joining Station',type:'assembly',criticality:'high'},
{code:'CMP-SEW',name:'Pegasus Sewing Machine',type:'component',parent:'ASM-SEW'},
{code:'PRT-NEEDLE',name:'Sewing Needle',type:'part',parent:'CMP-SEW'},
{code:'PRT-SEW-CABLE',name:'Sewing Machine Cable',type:'part',parent:'CMP-SEW'},
{code:'PRT-SEW-SOCKET',name:'Sewing Machine Socket',type:'part',parent:'CMP-SEW'},
{code:'PRT-SEW-BLADE',name:'Sewing Machine Blade',type:'part',parent:'CMP-SEW'},

{code:'ASM-UTIL',name:'Steam, Air & Utility Distribution',type:'assembly',criticality:'high'},
{code:'SUB-STEAM',name:'Steam Supply System',type:'subassembly',parent:'ASM-UTIL'},
{code:'PRT-STEAM-LINE',name:'Steam Lines & Couplings',type:'part',parent:'SUB-STEAM'},
{code:'SUB-AIR',name:'Pneumatic Air System',type:'subassembly',parent:'ASM-UTIL'},
{code:'PRT-AIR-LINE',name:'Air Lines & Fittings',type:'part',parent:'SUB-AIR'},

{code:'ASM-SAFE',name:'Fire & Emergency Safety System',type:'assembly',criticality:'critical'},
{code:'CMP-HYDRANT',name:'Fire Hydrant / Extinguisher Water Unit',type:'component',parent:'ASM-SAFE',criticality:'critical'},
{code:'PRT-FIRE-HOSE',name:'Fire Hose & Couplings',type:'part',parent:'CMP-HYDRANT'},
{code:'PRT-FIRE-NOZZLE',name:'Fire Hydrant Nozzle',type:'part',parent:'CMP-HYDRANT'},
{code:'CMP-ESTOP',name:'Emergency Stop System',type:'component',parent:'ASM-SAFE',criticality:'critical'},

{code:'ASM-CTRL',name:'Drive, Electrical & Instrumentation',type:'assembly',criticality:'high'},
{code:'CMP-DRIVE',name:'Main Machine Drive',type:'component',parent:'ASM-CTRL',criticality:'high'},
{code:'INS-YARD',name:'Yardage Counter',type:'instrument',parent:'ASM-CTRL'},
{code:'INS-LEVEL',name:'Level Sensor',type:'instrument',parent:'ASM-CTRL'},
{code:'CMP-ELEC',name:'Electrical Control System',type:'component',parent:'ASM-CTRL'},
{code:'CMP-WHEELS',name:'Machine Wheels / Running Gear',type:'component',parent:'ASM-CTRL'},
];
function full(c:string){return `${PREFIX}-${c}`;}
async function main(){const asset=await db.asset.findUnique({where:{assetTag:TAG},select:{id:true,assetTag:true,name:true,plantId:true}});if(!asset)throw new Error('Singeing asset missing');const ids=new Map<string,string>();
await db.$transaction(async tx=>{for(let i=0;i<HIERARCHY.length;i++){const n=HIERARCHY[i];const parentId=n.parent?ids.get(n.parent)??null:null;if(n.parent&&!parentId)throw new Error(`Missing parent ${n.parent}`);const componentCode=full(n.code);const existing=await tx.componentRegistry.findUnique({where:{componentCode},select:{id:true}});
const data={assetId:asset.id,parentId,twinId:null,componentCode,name:n.name,description:null,componentType:n.type,manufacturer:null,modelNumber:null,serialNumber:null,specification:null,operatingParams:null,criticality:n.criticality??'medium',lifecycleStatus:'operational',installedDate:null,expectedLifeHours:null,operatingHours:0,lastInspection:null,nextInspectionDue:null,healthScore:100,sortOrder:i+1,notes:'UAT hierarchy derived from GTP Singeing Machine historical maintenance titles. Maintenance-oriented subsystem names require OEM/nameplate/master-data verification before production approval.'};
const saved=existing?await tx.componentRegistry.update({where:{id:existing.id},data}):await tx.componentRegistry.create({data});ids.set(n.code,saved.id);}});
const rows=await db.componentRegistry.findMany({where:{assetId:asset.id,componentCode:{startsWith:PREFIX}},select:{id:true,parentId:true}});const set=new Set(rows.map(r=>r.id));const roots=rows.filter(r=>!r.parentId);const orphans=rows.filter(r=>r.parentId&&!set.has(r.parentId));if(rows.length!==HIERARCHY.length||roots.length!==8||orphans.length)throw new Error(`Singeing hierarchy failed nodes=${rows.length} roots=${roots.length} orphans=${orphans.length}`);
console.log(JSON.stringify({asset,nodes:rows.length,roots:roots.length,orphans:orphans.length,status:'PASS'},null,2));}
main().catch(e=>{console.error(e);process.exit(1)}).finally(async()=>db.$disconnect());