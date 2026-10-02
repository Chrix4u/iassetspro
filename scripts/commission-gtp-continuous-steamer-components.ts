import { PrismaClient } from '@prisma/client';
if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) throw new Error('DATABASE_URL must point to PostgreSQL');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db=new PrismaClient({adapter:createAdapter(process.env.DATABASE_URL)});
const TAG='UAT-GTP-333-1-005',PREFIX='GTP-CST';
type Node={code:string;name:string;type:'assembly'|'subassembly'|'component'|'part'|'instrument';parent?:string;criticality?:string};
const HIERARCHY:Node[]=[
{code:'ASM-INFEED',name:'Infeed & Cloth Guidance',type:'assembly',criticality:'high'},
{code:'CMP-INFEED',name:'Infeed Drive / Draw Roller',type:'component',parent:'ASM-INFEED',criticality:'high'},
{code:'CMP-GUIDER',name:'Foxwell Cloth Guider',type:'component',parent:'ASM-INFEED'},
{code:'CMP-ROLLOVER',name:'Cloth Rollover Handling',type:'component',parent:'ASM-INFEED',criticality:'high'},
{code:'CMP-GRIP',name:'Grip Tape / Cloth Traction',type:'component',parent:'ASM-INFEED'},

{code:'ASM-STEAM',name:'Steaming Chamber & Steam System',type:'assembly',criticality:'critical'},
{code:'CMP-CHAMBER',name:'Steaming Chamber',type:'component',parent:'ASM-STEAM',criticality:'critical'},
{code:'CMP-STEAM-TANK',name:'Steam Tank System',type:'component',parent:'ASM-STEAM'},
{code:'CMP-STEAM-LINE',name:'Steam Supply / Condensate Line',type:'component',parent:'ASM-STEAM'},
{code:'CMP-LAGGING',name:'Thermal Lagging / Insulation',type:'component',parent:'ASM-STEAM'},
{code:'INS-STEAM',name:'Steam Indicator',type:'instrument',parent:'ASM-STEAM'},

{code:'ASM-CHAIN',name:'Chain, Sprocket & Tension System',type:'assembly',criticality:'high'},
{code:'CMP-CHAIN',name:'Main / Infeed Chain',type:'component',parent:'ASM-CHAIN'},
{code:'CMP-SPROCKET',name:'Tension / Chain Sprocket',type:'component',parent:'ASM-CHAIN'},
{code:'CMP-TENSION',name:'Chain Tensioning System',type:'component',parent:'ASM-CHAIN'},

{code:'ASM-OUTFEED',name:'Plaiter & Outfeed',type:'assembly',criticality:'high'},
{code:'CMP-PLAIT1',name:'Plaiter 1',type:'component',parent:'ASM-OUTFEED'},
{code:'CMP-PLAIT2',name:'Plaiter 2',type:'component',parent:'ASM-OUTFEED'},
{code:'CMP-PLAIT9',name:'Plaiter 9',type:'component',parent:'ASM-OUTFEED'},
{code:'PRT-PLAIT-ARM',name:'Plaiter Arm / Stud',type:'part',parent:'ASM-OUTFEED'},

{code:'ASM-SEW',name:'Sewing & Cloth Joining',type:'assembly',criticality:'high'},
{code:'CMP-SEW',name:'Sewing Machine',type:'component',parent:'ASM-SEW'},
{code:'PRT-NEEDLE',name:'Sewing Needle',type:'part',parent:'CMP-SEW'},
{code:'PRT-SEW-CABLE',name:'Sewing Machine Cable',type:'part',parent:'CMP-SEW'},

{code:'ASM-UTIL',name:'Water & Pneumatic Utilities',type:'assembly',criticality:'high'},
{code:'CMP-WATER',name:'Water Pipeline / Chamber Water System',type:'component',parent:'ASM-UTIL'},
{code:'CMP-AIR',name:'Air Tubes / Pneumatic Supply',type:'component',parent:'ASM-UTIL'},

{code:'ASM-DRIVE',name:'Drive & Mechanical Transmission',type:'assembly',criticality:'high'},
{code:'CMP-DRIVE',name:'Main Drive',type:'component',parent:'ASM-DRIVE',criticality:'high'},
{code:'PRT-BELT',name:'Drive Belt',type:'part',parent:'CMP-DRIVE'},
{code:'PRT-BEAR',name:'Infeed Roller Bearings',type:'part',parent:'ASM-DRIVE'},

{code:'ASM-CTRL',name:'Electrical, Controls & Safety',type:'assembly',criticality:'high'},
{code:'CMP-PANEL',name:'Main Control Panel',type:'component',parent:'ASM-CTRL',criticality:'high'},
{code:'CMP-ESTOP',name:'Emergency Switch / Stop',type:'component',parent:'ASM-CTRL',criticality:'critical'},
{code:'CMP-LIGHT',name:'Steam Indicating Light',type:'component',parent:'ASM-CTRL'},
{code:'CMP-FIRE',name:'Fire Extinguisher Station',type:'component',parent:'ASM-CTRL'},
];
function full(c:string){return `${PREFIX}-${c}`;}
async function main(){const asset=await db.asset.findUnique({where:{assetTag:TAG},select:{id:true,assetTag:true,name:true,plantId:true}});if(!asset)throw new Error('Continuous Steamer missing');const ids=new Map<string,string>();await db.$transaction(async tx=>{for(let i=0;i<HIERARCHY.length;i++){const n=HIERARCHY[i];const parentId=n.parent?ids.get(n.parent)??null:null;if(n.parent&&!parentId)throw new Error(`Missing parent ${n.parent}`);const componentCode=full(n.code);const existing=await tx.componentRegistry.findUnique({where:{componentCode},select:{id:true}});const data={assetId:asset.id,parentId,twinId:null,componentCode,name:n.name,description:null,componentType:n.type,manufacturer:null,modelNumber:null,serialNumber:null,specification:null,operatingParams:null,criticality:n.criticality??'medium',lifecycleStatus:'operational',installedDate:null,expectedLifeHours:null,operatingHours:0,lastInspection:null,nextInspectionDue:null,healthScore:100,sortOrder:i+1,notes:'UAT hierarchy derived from GTP Continuous Steamer historical maintenance titles. Maintenance-oriented subsystem names require OEM/nameplate/master-data verification before production approval.'};const saved=existing?await tx.componentRegistry.update({where:{id:existing.id},data}):await tx.componentRegistry.create({data});ids.set(n.code,saved.id);}});const rows=await db.componentRegistry.findMany({where:{assetId:asset.id,componentCode:{startsWith:PREFIX}},select:{id:true,parentId:true}});const set=new Set(rows.map(r=>r.id));const roots=rows.filter(r=>!r.parentId);const orphans=rows.filter(r=>r.parentId&&!set.has(r.parentId));if(roots.length!==8||orphans.length)throw new Error(`Continuous Steamer hierarchy failed nodes=${rows.length} roots=${roots.length} orphans=${orphans.length}`);console.log(JSON.stringify({asset,nodes:rows.length,roots:roots.length,orphans:orphans.length,status:'PASS'},null,2));}
main().catch(e=>{console.error(e);process.exit(1)}).finally(async()=>db.$disconnect());