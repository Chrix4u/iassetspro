import { persistOpeningMeterReadings } from '@/services/assets/assetMeter.service';
import {NextRequest,NextResponse} from 'next/server';
import {db} from '@/lib/db';
import {getSession,isAdmin} from '@/lib/auth';
import {getPlantScope,canAccessPlant} from '@/lib/plant-scope';
import {normalizeCommissioningParameters,normalizeCommissioningMeters,mergeMachineSpecification,partMeterName} from '@/lib/asset-onboarding';

type Row=Record<string,unknown>;
const str=(v:unknown)=>typeof v==='string'?v.trim():v==null?'':String(v).trim();
function rows(body:Record<string,unknown>,sheet:string,limit:number):Row[]{
 const x=body[sheet];
 if(x==null)return [];
 if(!Array.isArray(x)||x.length>limit)throw Error(sheet+': maximum '+limit+' rows');
 return x.map((r,i)=>{if(!r||typeof r!=='object'||Array.isArray(r))throw Error(sheet+' row '+(i+2)+': invalid row');return r as Row;})
   .filter(r=>Object.values(r).some(x=>str(x)));
}
function required(v:unknown,label:string){let x=str(v);if(!x)throw Error(label+' is required');return x}
function codes(records:Row[],key:string,sheet:string){
 const result=new Set<string>();
 records.forEach((r,i)=>{const code=required(r[key],sheet+' row '+(i+2)+' '+key);
  if(result.has(code))throw Error(sheet+': duplicate '+code);result.add(code)});
 return result;
}
const types=new Set(['assembly','subassembly','component','part','auxiliary','instrument']);
const critically=new Set(['low','medium','high','critical']);
const by=<T,>(list:T[],fn:(v:T)=>string)=>{const m=new Map<string,T[]>();list.forEach(v=>{let k=fn(v);m.set(k,[...(m.get(k)||[]),v])});return m;};
function validateVisual(v:Row){
 const u=required(v.imageUrl,'Visual URL');
 if(u.length>2000||!/^https:\/\//i.test(u))throw Error('Visual image URLs must be trusted HTTPS links');
 if(!['photo','schematic','technical_2d','exploded'].includes(str(v.visualType)))throw Error('Invalid visual type');
 return u;
}

/** Structured bulk machine import. Dry-run is read-only, commit is all-or-nothing. */
export async function POST(request:NextRequest){
 const session=getSession(request);
 if(!session)return NextResponse.json({success:false,error:'Not authenticated'},{status:401});
 if(!isAdmin(session))return NextResponse.json({success:false,error:'Bulk factory commissioning requires administrator approval'},{status:403});
 try{
  const body=await request.json() as Record<string,unknown>;
  if(JSON.stringify(body).length>2500000)throw Error('Maximum import size is 2.5 MB');
  const machines=rows(body,'Machines',50),parts=rows(body,'Parts',500),
   params=rows(body,'Parameters',2000),meters=rows(body,'Meters',600),visuals=rows(body,'Visuals',500);
  if(!machines.length)throw Error('Machines sheet is empty');
  const machineCodes=codes(machines,'machineCode','Machines'),partCodes=codes(parts,'componentCode','Parts');
  const scope=await getPlantScope(request,session);
  if(scope.denyAccess)return NextResponse.json({success:false,error:'Plant access denied'},{status:403});
  const [plants,categories,locations,registeredMachines,registeredParts]=await Promise.all([
   db.plant.findMany({where:{code:{in:[...new Set(machines.map(m=>str(m.plantCode)))]}}}),
   db.assetCategory.findMany({where:{code:{in:[...new Set(machines.map(m=>str(m.categoryCode)))]}}}),
   db.functionalLocation.findMany({where:{locationCode:{in:[...new Set(machines.map(m=>str(m.locationCode)))]}},include:{hierarchySystem:true,hierarchyLevel:true}}),
   db.asset.findMany({where:{assetTag:{in:[...machineCodes]}},select:{assetTag:true}}),
   db.componentRegistry.findMany({where:{componentCode:{in:[...partCodes]}},select:{componentCode:true}}),
  ]);
  if(registeredMachines.length)throw Error('Machine code already exists: '+registeredMachines[0].assetTag);
  if(registeredParts.length)throw Error('Part code already exists: '+registeredParts[0].componentCode);
  const plantBy=new Map(plants.map(x=>[x.code,x]));
  const catBy=new Map(categories.map(x=>[x.code,x]));
  const locBy=by(locations,x=>x.locationCode);
  for(const m of machines){
    const code=str(m.machineCode),plant=plantBy.get(required(m.plantCode,code+' plant code'));
    required(m.machineName,code+' machine name');
    if(!plant||!canAccessPlant(scope,plant.id))throw Error(code+': unknown or inaccessible plant');
    if(!catBy.has(required(m.categoryCode,code+' category code')))throw Error(code+': unknown category code');
    const matched=(locBy.get(required(m.locationCode,code+' hierarchy location'))||[]).filter(l=>
     l.plantId===plant.id&&l.status==='active'&&l.hierarchySystem.isActive&&
     l.hierarchyLevel.isActive&&l.hierarchyLevel.allowAssetAssignment);
    if(matched.length!==1)throw Error(code+': location must match exactly one active assignable coded path in this plant');
    if(m.criticality&&!critically.has(str(m.criticality).toLowerCase()))throw Error(code+': invalid criticality');
  }
  const partMap=new Map(parts.map(x=>[str(x.componentCode),x]));
  for(const part of parts){
    const code=str(part.componentCode),parent=str(part.parentCode),machineCode=str(part.machineCode);
    if(!machineCodes.has(machineCode))throw Error(code+': machine code is not in Machines sheet');
    required(part.name,code+' name');
    if(!types.has(str(part.componentType).toLowerCase()))throw Error(code+': invalid component type');
    if(part.criticality&&!critically.has(str(part.criticality).toLowerCase()))throw Error(code+': invalid criticality');
    if(parent&&(!partMap.has(parent)||str(partMap.get(parent)?.machineCode)!==machineCode))
      throw Error(code+': parent code must belong to the same machine');
  }
  const ordered:Row[]=[],remaining=[...parts],done=new Set<string>();
  while(remaining.length){
   const i=remaining.findIndex(x=>!str(x.parentCode)||done.has(str(x.parentCode)));
   if(i<0)throw Error('Part hierarchy contains a cycle or missing parent');
   const [next]=remaining.splice(i,1);ordered.push(next);done.add(str(next.componentCode));
  }
  type P=ReturnType<typeof normalizeCommissioningParameters>[number];
  type M=ReturnType<typeof normalizeCommissioningMeters>[number];
  const machineParams=new Map<string,P[]>(),partParams=new Map<string,P[]>();
  const machineMeters=new Map<string,M[]>(),partMeters=new Map<string,M[]>();
  const owner=(r:Row,sheet:string)=>{
    const type=str(r.ownerType),code=required(r.ownerCode,sheet+' ownerCode');
    if(!['machine','part'].includes(type))throw Error(sheet+' '+code+': ownerType must be machine or part');
    if(!(type==='machine'?machineCodes:partCodes).has(code))throw Error(sheet+' '+code+': owner does not exist in workbook');
    return {type,code};
  };
  for(const r of params){
    const {type,code}=owner(r,'Parameters');
    const parameter=normalizeCommissioningParameters([{
      name:r.name,inspectionType:r.inspectionType,unit:r.unit,min:r.min,max:r.max,reference:r.reference,
    }])[0];
    const target=type==='machine'?machineParams:partParams;
    target.set(code,[...(target.get(code)||[]),parameter]);
  }
  for(const list of [...machineParams.values(),...partParams.values()])normalizeCommissioningParameters(list);
  for(const r of meters){
    const {type,code}=owner(r,'Meters');
    const meter=normalizeCommissioningMeters([r])[0];
    const target=type==='machine'?machineMeters:partMeters;
    target.set(code,[...(target.get(code)||[]),meter]);
  }
  for(const list of [...machineMeters.values(),...partMeters.values()])normalizeCommissioningMeters(list);
  // Asset-meter names must stay unique per machine; PM uses these names as canonical sources.
  for(const machineCode of machineCodes){
    const all=[...(machineMeters.get(machineCode)||[])];
    for(const part of parts.filter(p=>str(p.machineCode)===machineCode))
      all.push(...(partMeters.get(str(part.componentCode))||[]).map(m=>({...m,name:partMeterName(str(part.componentCode),m.name)})));
    normalizeCommissioningMeters(all);
  }
  for(const visual of visuals){owner(visual,'Visuals');validateVisual(visual);}
  const count={machines:machines.length,parts:parts.length,parameters:params.length,meters:meters.length,visuals:visuals.length};
  if(body.dryRun===true)return NextResponse.json({success:true,data:{valid:true,counts:count,
    message:'Validated against the live category, plant, and coded-location registries. No records created.'}});
  const result=await db.$transaction(async tx=>{
    const assetIds=new Map<string,string>(),partIds=new Map<string,string>();
    for(const m of machines){
      const code=str(m.machineCode),plant=plantBy.get(str(m.plantCode))!;
      const loc=locBy.get(str(m.locationCode))!.find(l=>l.plantId===plant.id&&l.status==='active'&&
       l.hierarchySystem.isActive&&l.hierarchyLevel.isActive&&l.hierarchyLevel.allowAssetAssignment)!;
      const specs=machineParams.get(code)||[],meterDefs=machineMeters.get(code)||[];
      const asset=await tx.asset.create({data:{
       assetTag:code,name:str(m.machineName),plantId:plant.id,categoryId:catBy.get(str(m.categoryCode))!.id,
       manufacturer:str(m.manufacturer)||null,model:str(m.model)||null,serialNumber:str(m.serialNumber)||null,
       description:str(m.description)||null,criticality:str(m.criticality).toLowerCase()||'medium',
       specification:mergeMachineSpecification('{}',specs),createdById:session.userId,
       functionalLocationAssignments:{create:{functionalLocationId:loc.id,
        hierarchySystemId:loc.hierarchySystemId,assignedById:session.userId,
        reason:'Verified factory onboarding workbook'}},
       ...(meterDefs.length?{assetMeters:{create:meterDefs.map(d=>({
         name:d.name,meterType:d.meterType,unit:d.unit,currentValue:d.initialValue,
         lastReadingAt:d.initialReadingProvided?new Date():null,createdById:session.userId,
       }))}}:{}),
      },select:{id:true}});
      assetIds.set(code,asset.id);
    }
    for(const p of ordered){
      const code=str(p.componentCode),defs=partParams.get(code)||[];
      const created=await tx.componentRegistry.create({data:{
       componentCode:code,name:str(p.name),assetId:assetIds.get(str(p.machineCode))!,
       parentId:str(p.parentCode)?partIds.get(str(p.parentCode))!:null,
       componentType:str(p.componentType).toLowerCase(),
       manufacturer:str(p.manufacturer)||null,modelNumber:str(p.modelNumber)||null,
       description:str(p.description)||null,criticality:str(p.criticality).toLowerCase()||'medium',
       ...(defs.length?{inspectionPoints:{create:defs.map((d,i)=>({
         name:d.name,inspectionType:d.inspectionType,parameterKey:d.key,
         description:d.reference||null,normalRange:JSON.stringify({min:d.min,max:d.max,unit:d.unit}),sortOrder:i,
       }))}}:{}),
      },select:{id:true}});
      partIds.set(code,created.id);
      const defsMeter=partMeters.get(code)||[];
      if(defsMeter.length)await tx.assetMeter.createMany({data:defsMeter.map(d=>({
       assetId:assetIds.get(str(p.machineCode))!,componentId:created.id,
       name:partMeterName(code,d.name),meterType:d.meterType,unit:d.unit,currentValue:d.initialValue,
       lastReadingAt:d.initialReadingProvided?new Date():null,createdById:session.userId,
      }))});
    }
    // These are newly created machines only. Include both machine and part
    // counters; never synthesize history for old registrations.
    for(const m of machines){
      const assetId=assetIds.get(str(m.machineCode))!;
      const plantId=plantBy.get(str(m.plantCode))!.id;
      const meters=await tx.assetMeter.findMany({where:{assetId,lastReadingAt:{not:null}}});
      await persistOpeningMeterReadings(tx,{assetId,plantId,actorId:session.userId,meters});
    }
    for(const v of visuals){
      const {type,code}=owner(v,'Visuals');
      const assetId=type==='machine'?assetIds.get(code)!:
        assetIds.get(str(partMap.get(code)!.machineCode))!;
      const kind=str(v.visualType),imageUrl=validateVisual(v);
      await tx.componentVisual.create({data:{
       assetId,componentId:type==='part'?partIds.get(code)!:null,
       title:str(v.title)||code+' approved source visual',visualType:kind,
       imageUrl,description:str(v.reference)||null,sourceProvider:'external_reference',
       createdById:session.userId,isPrimary:false,
      }});
    }
    await tx.auditLog.create({data:{
      userId:session.userId,action:'create',entityType:'asset_factory_import',
      entityId:assetIds.get(str(machines[0].machineCode))!,
      newValues:JSON.stringify({counts:count,machineCodes:[...assetIds.keys()],
       source:'customer_completed_excel',locationAuthority:'functional_location_hierarchy'}),
    }});
    return {counts:count,machineIds:[...assetIds.values()]};
  },{timeout:60000,maxWait:15000});
  return NextResponse.json({success:true,data:result},{status:201});
 }catch(error){
  const message=error instanceof Error?error.message:'Factory workbook import failed';
  return NextResponse.json({success:false,error:message},
    {status:/unique|already exists|duplicate/i.test(message)?409:
      /required|invalid|unknown|missing|cycle|must|exceeds|inaccessible|belongs|maximum|not listed|location|meters/i.test(message)?400:500});
 }
}
