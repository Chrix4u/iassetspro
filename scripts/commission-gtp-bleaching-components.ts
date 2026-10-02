import { PrismaClient } from '@prisma/client';
if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) throw new Error('DATABASE_URL must point to PostgreSQL');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db=new PrismaClient({adapter:createAdapter(process.env.DATABASE_URL)});
const TAG='UAT-GTP-310-1-004',PREFIX='GTP-BLR';
type Node={code:string;name:string;type:'assembly'|'subassembly'|'component'|'part'|'instrument';parent?:string;criticality?:string};
const HIERARCHY:Node[]=[
{code:'ASM-INFEED',name:'Infeed, Guiding & Saturation',type:'assembly',criticality:'high'},
{code:'CMP-SAT1',name:'First Saturator',type:'component',parent:'ASM-INFEED',criticality:'high'},
{code:'CMP-SAT1-MANGLE',name:'First Saturator Mangle / Squeezer',type:'component',parent:'CMP-SAT1'},
{code:'CMP-SAT1-BOWL',name:'First Saturator Squeezer Bowl',type:'component',parent:'CMP-SAT1-MANGLE'},
{code:'PRT-SAT1-BEAR',name:'First Saturator Bearings',type:'part',parent:'CMP-SAT1'},
{code:'CMP-SAT2',name:'Second Saturator',type:'component',parent:'ASM-INFEED'},
{code:'CMP-GUIDE-ROLLER',name:'Guide Roller Train',type:'component',parent:'ASM-INFEED'},
{code:'CMP-GRIP-TAPE',name:'Grip Tape / Cloth Traction',type:'component',parent:'ASM-INFEED'},

{code:'ASM-WASH',name:'Washing Train',type:'assembly',criticality:'critical'},
{code:'SUB-WASH1',name:'Washer 1',type:'subassembly',parent:'ASM-WASH',criticality:'high'},
{code:'CMP-W1-MANGLE',name:'Washer 1 Mangle / Squeezer',type:'component',parent:'SUB-WASH1'},
{code:'CMP-W1-PUMP',name:'Washer 1 Pump',type:'component',parent:'SUB-WASH1'},
{code:'CMP-W1-CHAIN',name:'Washer 1 Chain Drive',type:'component',parent:'SUB-WASH1'},
{code:'SUB-WASH2',name:'Washer 2',type:'subassembly',parent:'ASM-WASH',criticality:'high'},
{code:'CMP-W2-MANGLE',name:'Washer 2 Squeezer Mangle',type:'component',parent:'SUB-WASH2'},
{code:'CMP-W2-SOL',name:'Washer 2 Solenoid Valve',type:'component',parent:'SUB-WASH2'},
{code:'CMP-W2-CHAIN',name:'Washer 2 Chain Drive',type:'component',parent:'SUB-WASH2'},
{code:'INS-W2-TEMP',name:'Washer 2 Temperature Gauge',type:'instrument',parent:'SUB-WASH2'},
{code:'SUB-WASH3',name:'Washer 3',type:'subassembly',parent:'ASM-WASH',criticality:'high'},
{code:'CMP-W3-MANGLE',name:'Washer 3 Squeezer / Bowl',type:'component',parent:'SUB-WASH3'},
{code:'CMP-W3-PUMP',name:'Washer 3 Pump',type:'component',parent:'SUB-WASH3'},
{code:'CMP-W3-CHAIN',name:'Washer 3 Chain Drive',type:'component',parent:'SUB-WASH3'},
{code:'INS-W3-YARD',name:'Washer 3 Yard Counter',type:'instrument',parent:'SUB-WASH3'},

{code:'ASM-JBOX',name:'J-Box Processing System',type:'assembly',criticality:'high'},
{code:'SUB-J1',name:'J-Box 1',type:'subassembly',parent:'ASM-JBOX',criticality:'high'},
{code:'CMP-J1-PANEL',name:'J-Box 1 Control Panel',type:'component',parent:'SUB-J1'},
{code:'CMP-J1-OVERFLOW',name:'J-Box 1 Caustic Overflow / Outlet',type:'component',parent:'SUB-J1'},
{code:'CMP-J1-CHAIN',name:'J-Box 1 Chain',type:'component',parent:'SUB-J1'},
{code:'CMP-J1-MANGLE',name:'J-Box 1 Mangle / Squeezer',type:'component',parent:'SUB-J1'},
{code:'CMP-J1-ROOF',name:'J-Box 1 Roof / Cover',type:'component',parent:'SUB-J1'},
{code:'SUB-J2',name:'J-Box 2',type:'subassembly',parent:'ASM-JBOX'},
{code:'CMP-J2-PROCESS',name:'J-Box 2 Cloth Process Zone',type:'component',parent:'SUB-J2'},
{code:'CMP-JBOX-COMP',name:'J-Box Compensator & Switch',type:'component',parent:'ASM-JBOX'},

{code:'ASM-FLUID',name:'Chemical, Water, Steam & Air Utilities',type:'assembly',criticality:'high'},
{code:'CMP-CHEM-PUMP',name:'Chemical Pump',type:'component',parent:'ASM-FLUID'},
{code:'CMP-WATER-LINE',name:'Water Supply / Drain Lines',type:'component',parent:'ASM-FLUID'},
{code:'CMP-STEAM-LINE',name:'Steam Supply & Valve System',type:'component',parent:'ASM-FLUID'},
{code:'CMP-AIR-LINE',name:'Pneumatic Air Distribution',type:'component',parent:'ASM-FLUID'},
{code:'CMP-SOL-VALVE',name:'General Solenoid Valves',type:'component',parent:'ASM-FLUID'},
{code:'CMP-WWTP-LINE',name:'Bleaching / WWTP Transfer Line',type:'component',parent:'ASM-FLUID'},

{code:'ASM-DRIVE',name:'Mechanical Drive & Transmission',type:'assembly',criticality:'high'},
{code:'CMP-CHAIN',name:'General Chain Drives',type:'component',parent:'ASM-DRIVE'},
{code:'CMP-COUPLING',name:'Couplings',type:'component',parent:'ASM-DRIVE'},
{code:'CMP-GEARBOX',name:'Gearbox Group',type:'component',parent:'ASM-DRIVE'},
{code:'CMP-MOTOR',name:'Squeezer / Process Motors',type:'component',parent:'ASM-DRIVE'},
{code:'PRT-BEAR',name:'General Bearings',type:'part',parent:'ASM-DRIVE'},
{code:'PRT-SHAFT',name:'Roller / Squeezer Shafts',type:'part',parent:'ASM-DRIVE'},

{code:'ASM-OUTFEED',name:'Piler & Outfeed',type:'assembly',criticality:'high'},
{code:'CMP-PILER',name:'Stationary Piler',type:'component',parent:'ASM-OUTFEED'},
{code:'PRT-PILER-SPROCKET',name:'Piler Sprocket / Shaft',type:'part',parent:'CMP-PILER'},
{code:'CMP-OUTFEED-ROLLER',name:'Outfeed Roller Train',type:'component',parent:'ASM-OUTFEED'},

{code:'ASM-AUX',name:'Sewing, Safety & Auxiliary Equipment',type:'assembly'},
{code:'CMP-SEW',name:'Sewing Machine',type:'component',parent:'ASM-AUX'},
{code:'PRT-NEEDLE',name:'Sewing Machine Needle',type:'part',parent:'CMP-SEW'},
{code:'CMP-LIGHT',name:'Machine Lighting',type:'component',parent:'ASM-AUX'},
{code:'CMP-EYEWASH',name:'Emergency Eye Wash Area',type:'component',parent:'ASM-AUX'},
{code:'CMP-RESERVOIR',name:'Underground Water Reservoir / Pit Covers',type:'component',parent:'ASM-AUX'},

{code:'ASM-CTRL',name:'Electrical & Instrumentation',type:'assembly',criticality:'high'},
{code:'CMP-POT',name:'Potentiometer / Pot Meter',type:'component',parent:'ASM-CTRL'},
{code:'CMP-COMP-SW',name:'Compensator Switch',type:'component',parent:'ASM-CTRL'},
{code:'CMP-PANEL',name:'Machine Control Panels',type:'component',parent:'ASM-CTRL'},
{code:'CMP-CABLE',name:'Electrical Cabling',type:'component',parent:'ASM-CTRL'},
];
function full(c:string){return `${PREFIX}-${c}`;}
async function main(){const asset=await db.asset.findUnique({where:{assetTag:TAG},select:{id:true,assetTag:true,name:true,plantId:true}});if(!asset)throw new Error('Bleaching Range missing');const ids=new Map<string,string>();
await db.$transaction(async tx=>{for(let i=0;i<HIERARCHY.length;i++){const n=HIERARCHY[i];const parentId=n.parent?ids.get(n.parent)??null:null;if(n.parent&&!parentId)throw new Error(`Missing parent ${n.parent}`);const componentCode=full(n.code);const existing=await tx.componentRegistry.findUnique({where:{componentCode},select:{id:true}});const data={assetId:asset.id,parentId,twinId:null,componentCode,name:n.name,description:null,componentType:n.type,manufacturer:null,modelNumber:null,serialNumber:null,specification:null,operatingParams:null,criticality:n.criticality??'medium',lifecycleStatus:'operational',installedDate:null,expectedLifeHours:null,operatingHours:0,lastInspection:null,nextInspectionDue:null,healthScore:100,sortOrder:i+1,notes:'UAT hierarchy derived from GTP Bleaching Range historical maintenance titles. Maintenance-oriented subsystem names require OEM/nameplate/master-data verification before production approval.'};const saved=existing?await tx.componentRegistry.update({where:{id:existing.id},data}):await tx.componentRegistry.create({data});ids.set(n.code,saved.id);}});
const rows=await db.componentRegistry.findMany({where:{assetId:asset.id,componentCode:{startsWith:PREFIX}},select:{id:true,parentId:true}});const set=new Set(rows.map(r=>r.id));const roots=rows.filter(r=>!r.parentId);const orphans=rows.filter(r=>r.parentId&&!set.has(r.parentId));if(roots.length!==8||orphans.length)throw new Error(`Bleaching hierarchy failed nodes=${rows.length} roots=${roots.length} orphans=${orphans.length}`);console.log(JSON.stringify({asset,nodes:rows.length,roots:roots.length,orphans:orphans.length,status:'PASS'},null,2));}
main().catch(e=>{console.error(e);process.exit(1)}).finally(async()=>db.$disconnect());