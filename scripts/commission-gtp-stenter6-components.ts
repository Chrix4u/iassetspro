import { PrismaClient } from '@prisma/client';

if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL)) throw new Error('DATABASE_URL must point to PostgreSQL');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createAdapter } = require('../src/lib/create-postgres-adapter');
const db = new PrismaClient({ adapter: createAdapter(process.env.DATABASE_URL) });

const TARGET_ASSET_TAG='UAT-GTP-340-6-008';
const PREFIX='GTP-ST6';
type NodeSpec={code:string;name:string;type:'assembly'|'subassembly'|'component'|'part'|'instrument';parent?:string;criticality?:string};
const HIERARCHY:NodeSpec[]=[
 {code:'ASM-INFEED',name:'Infeed, Guiding & Pinning',type:'assembly',criticality:'high'},
 {code:'SUB-PIN',name:'Pin Roller & Brush Infeed',type:'subassembly',parent:'ASM-INFEED'},
 {code:'CMP-PIN-ROLLER',name:'Pin / Witching Roller',type:'component',parent:'SUB-PIN'},
 {code:'PRT-PIN-BRUSH',name:'Pin / Metal / Fibre Brushes',type:'part',parent:'SUB-PIN'},
 {code:'CMP-FEELER',name:'Feeler / Filler Head',type:'component',parent:'ASM-INFEED',criticality:'high'},
 {code:'CMP-GUIDER',name:'Foxwell Cloth Guider',type:'component',parent:'ASM-INFEED'},
 {code:'INS-YARD',name:'Yard Counter',type:'instrument',parent:'ASM-INFEED'},
 {code:'CMP-INFEED-LIGHT',name:'Infeed Lighting',type:'component',parent:'ASM-INFEED'},

 {code:'ASM-CHAIN',name:'Stenter Chain, Clips & Conveying',type:'assembly',criticality:'critical'},
 {code:'SUB-CHAIN',name:'Stenter Chain System',type:'subassembly',parent:'ASM-CHAIN',criticality:'critical'},
 {code:'PRT-CHAIN',name:'Stenter Chain',type:'part',parent:'SUB-CHAIN',criticality:'critical'},
 {code:'PRT-CLIP-SHOE',name:'Clip Shoes / Chain Conveyor Shoes',type:'part',parent:'SUB-CHAIN',criticality:'high'},
 {code:'CMP-CHAIN-CYL',name:'Chain Cylinder',type:'component',parent:'SUB-CHAIN'},
 {code:'CMP-CONVEYOR',name:'Chain Conveyor',type:'component',parent:'ASM-CHAIN'},
 {code:'CMP-CONV-GEAR',name:'Conveyor Gearbox & Wheels',type:'component',parent:'CMP-CONVEYOR',criticality:'high'},

 {code:'ASM-MANGLE',name:'Mangle, Squeezing & Roller Train',type:'assembly',criticality:'high'},
 {code:'CMP-MANGLE',name:'Squeezing Mangle',type:'component',parent:'ASM-MANGLE',criticality:'high'},
 {code:'PRT-MANGLE-BEAR',name:'Mangle Bearings',type:'part',parent:'CMP-MANGLE'},
 {code:'CMP-SQ-BOWL',name:'Squeezing Bowl / Roller',type:'component',parent:'ASM-MANGLE'},
 {code:'CMP-DISK-OUT',name:'Disk Outfeed',type:'component',parent:'ASM-MANGLE'},
 {code:'CMP-GRIP-TAPE',name:'Outfeed Grip Tape',type:'component',parent:'ASM-MANGLE'},

 {code:'ASM-DRY',name:'Drying Chambers, Burners & Airflow',type:'assembly',criticality:'critical'},
 {code:'SUB-BURN',name:'Burner System',type:'subassembly',parent:'ASM-DRY',criticality:'critical'},
 {code:'CMP-BURNERS',name:'Burners 1–6',type:'component',parent:'SUB-BURN',criticality:'critical'},
 {code:'INS-BURN-CTRL',name:'Burner Control Knob / Firing Controls',type:'instrument',parent:'SUB-BURN'},
 {code:'SUB-FANS',name:'Circulating Fan System',type:'subassembly',parent:'ASM-DRY'},
 {code:'CMP-FANS',name:'Circulating Fans',type:'component',parent:'SUB-FANS',criticality:'high'},
 {code:'SUB-CHAMBER',name:'Drying Chamber Enclosure',type:'subassembly',parent:'ASM-DRY'},
 {code:'PRT-DOOR-SEAL',name:'Chamber Door Seals',type:'part',parent:'SUB-CHAMBER'},
 {code:'PRT-HEAT-PROT',name:'Heat Protector / Insulation',type:'part',parent:'SUB-CHAMBER'},
 {code:'PRT-SIEVE',name:'Chamber Sieve',type:'part',parent:'SUB-CHAMBER'},
 {code:'CMP-DOOR',name:'Chamber Doors & Handles',type:'component',parent:'SUB-CHAMBER'},

 {code:'ASM-DRIVE',name:'Main Drive & Transmission',type:'assembly',criticality:'critical'},
 {code:'CMP-MAIN-GEAR',name:'Main Gearbox',type:'component',parent:'ASM-DRIVE',criticality:'critical'},
 {code:'PRT-GEAR-SEAT',name:'Main Gearbox Seat / Mount',type:'part',parent:'CMP-MAIN-GEAR'},
 {code:'CMP-MAIN-SHAFT',name:'Main Drive Shaft',type:'component',parent:'ASM-DRIVE',criticality:'high'},
 {code:'PRT-SHAFT-BEAR',name:'Main Drive Shaft Bearings',type:'part',parent:'CMP-MAIN-SHAFT'},

 {code:'ASM-FLUID',name:'Pneumatic, Hydraulic & Utility Fluids',type:'assembly',criticality:'high'},
 {code:'SUB-PNEU',name:'Pneumatic Air Distribution',type:'subassembly',parent:'ASM-FLUID'},
 {code:'PRT-AIR-LINE',name:'Air Lines, Hoses & Fittings',type:'part',parent:'SUB-PNEU'},
 {code:'CMP-HYD-GAUGE',name:'Hydraulic Gauge',type:'component',parent:'ASM-FLUID'},
 {code:'CMP-BALL-VALVE',name:'Infeed Ball Valve',type:'component',parent:'ASM-FLUID'},
 {code:'CMP-GAS-LINE',name:'Gas Supply / Leakage Circuit',type:'component',parent:'ASM-FLUID',criticality:'critical'},

 {code:'ASM-OUTFEED',name:'Outfeed, Batching & Framing',type:'assembly',criticality:'high'},
 {code:'CMP-BATCH-FRAME',name:'Batching Frame',type:'component',parent:'ASM-OUTFEED'},
 {code:'CMP-BATCH-ARM',name:'Batch Arm & Roller',type:'component',parent:'ASM-OUTFEED'},
 {code:'CMP-BED',name:'Stenter Bed / Bed Setting',type:'component',parent:'ASM-OUTFEED'},
 {code:'CMP-LIFTER',name:'Lifter',type:'component',parent:'ASM-OUTFEED'},

 {code:'ASM-SEW',name:'Sewing & Cloth Joining Station',type:'assembly',criticality:'high'},
 {code:'CMP-SEWING',name:'Merrow / Pegasus Sewing Machine',type:'component',parent:'ASM-SEW'},
 {code:'PRT-SEW-NEEDLE',name:'Sewing Machine Needle',type:'part',parent:'CMP-SEWING'},
 {code:'PRT-SEW-CABLE',name:'Sewing Machine Cable',type:'part',parent:'CMP-SEWING'},

 {code:'ASM-CTRL',name:'Electrical & General Controls',type:'assembly',criticality:'high'},
 {code:'CMP-PLUG',name:'Machine Plugs & Connections',type:'component',parent:'ASM-CTRL'},
 {code:'PRT-ELEC-CABLE',name:'Electrical Cables & Covers',type:'part',parent:'ASM-CTRL'},
 {code:'CMP-MAHLO',name:'Mahlo Control / Guidance System',type:'component',parent:'ASM-CTRL'},
];
function fullCode(code:string){return `${PREFIX}-${code}`;}
async function main(){
 const asset=await db.asset.findUnique({where:{assetTag:TARGET_ASSET_TAG},select:{id:true,assetTag:true,name:true,plantId:true}}); if(!asset)throw new Error(`${TARGET_ASSET_TAG} is missing`);
 const idByCode=new Map<string,string>();
 await db.$transaction(async(tx)=>{
  for(let i=0;i<HIERARCHY.length;i++){const n=HIERARCHY[i];const parentId=n.parent?idByCode.get(n.parent)??null:null;if(n.parent&&!parentId)throw new Error(`Missing parent ${n.parent}`);
   const componentCode=fullCode(n.code); const existing=await tx.componentRegistry.findUnique({where:{componentCode},select:{id:true}});
   const data={assetId:asset.id,parentId,twinId:null,componentCode,name:n.name,description:null,componentType:n.type,manufacturer:null,modelNumber:null,serialNumber:null,specification:null,operatingParams:null,criticality:n.criticality??'medium',lifecycleStatus:'operational',installedDate:null,expectedLifeHours:null,operatingHours:0,lastInspection:null,nextInspectionDue:null,healthScore:100,sortOrder:i+1,notes:'UAT hierarchy derived from GTP Stenter 6 historical maintenance titles. Names and boundaries are maintenance-oriented and require OEM/master-data verification before production approval.'};
   const saved=existing?await tx.componentRegistry.update({where:{id:existing.id},data}):await tx.componentRegistry.create({data}); idByCode.set(n.code,saved.id);
  }
 });
 const rows=await db.componentRegistry.findMany({where:{assetId:asset.id,componentCode:{startsWith:PREFIX}},select:{id:true,parentId:true}});const ids=new Set(rows.map(r=>r.id));const roots=rows.filter(r=>!r.parentId);const orphans=rows.filter(r=>r.parentId&&!ids.has(r.parentId));
 if(rows.length!==HIERARCHY.length||roots.length!==9||orphans.length)throw new Error(`Stenter 6 hierarchy verification failed nodes=${rows.length} roots=${roots.length} orphans=${orphans.length}`);
 console.log(JSON.stringify({asset,nodes:rows.length,roots:roots.length,orphans:orphans.length,status:'PASS'},null,2));
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(async()=>db.$disconnect());
