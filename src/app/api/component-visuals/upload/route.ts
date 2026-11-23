import {NextRequest,NextResponse} from 'next/server';
import {mkdir,writeFile,unlink,lstat,chmod} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {db} from '@/lib/db';
import {privateComponentPhotoRoot} from '@/lib/component-private-photos';
import {getSession,hasPermission,isAdmin} from '@/lib/auth';
import {getPlantScope,canAccessPlantStrict} from '@/lib/plant-scope';

export const runtime='nodejs';
const MAX_PHOTO_BYTES=10*1024*1024;
const FORMATS:Record<string,{extension:string;matches:(data:Buffer)=>boolean}>={
 'image/png':{extension:'png',matches:b=>b.length>=8&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))},
 'image/jpeg':{extension:'jpg',matches:b=>b.length>=4&&b[0]===255&&b[1]===216&&b[2]===255},
 'image/webp':{extension:'webp',matches:b=>b.length>=12&&b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP'},
};
/** Genuine factory/OEM photo upload. Never accepts SVG, HTML or client file paths. */
export async function POST(request:NextRequest){
 const session=getSession(request);
 if(!session)return NextResponse.json({success:false,error:'Not authenticated'},{status:401});
 if(!isAdmin(session)&&!hasPermission(session,'digital_twin.manage')&&!hasPermission(session,'assets.hierarchy'))
   return NextResponse.json({success:false,error:'Machine photo upload permission required'},{status:403});
 try{
  const form=await request.formData();
  const assetId=String(form.get('assetId')||'').trim();
  const componentId=String(form.get('componentId')||'').trim()||null;
  const title=String(form.get('title')||'').trim().slice(0,160)||'Factory reference photograph';
  const file=form.get('file');
  if(!assetId||!file||typeof file==='string'||!('arrayBuffer' in file))
    return NextResponse.json({success:false,error:'Machine and photo file are required'},{status:400});
  const format=FORMATS[file.type];
  if(!format||file.size<16||file.size>MAX_PHOTO_BYTES)
    return NextResponse.json({success:false,error:'Only PNG, JPEG or WebP images up to 10 MB are supported'},{status:415});
  const data=Buffer.from(await file.arrayBuffer());
  if(data.length!==file.size||!format.matches(data))
    return NextResponse.json({success:false,error:'Image content does not match its declared format'},{status:415});
  const scope=await getPlantScope(request,session);
  const asset=await db.asset.findUnique({where:{id:assetId},select:{id:true,plantId:true}});
  if(!asset||!canAccessPlantStrict(scope,asset.plantId))
    return NextResponse.json({success:false,error:'Machine not accessible'},{status:403});
  if(componentId){
    const component=await db.componentRegistry.findUnique({where:{id:componentId},select:{id:true,assetId:true}});
    if(!component||component.assetId!==asset.id)
      return NextResponse.json({success:false,error:'Photo assembly is not part of this machine'},{status:400});
  }
  const folder=privateComponentPhotoRoot();
  const filename='factory-photo-'+randomUUID()+'.'+format.extension;
  const fullPath=folder+'/'+filename;
  // The persistent photo directory must never expose customer machine images
  // to other local users; do not follow a symlinked storage root.
  await mkdir(folder,{recursive:true,mode:0o700});
  const folderInfo=await lstat(folder);
  if(!folderInfo.isDirectory()||folderInfo.isSymbolicLink())
    throw new Error('Private factory photo storage is not a real directory');
  await chmod(folder,0o700);
  await writeFile(fullPath,data,{flag:'wx',mode:0o600});
  try {
    const visual=await db.$transaction(async tx=>{
      await tx.componentVisual.updateMany({
        where:{assetId:asset.id,componentId,visualType:'photo',isPrimary:true},
        data:{isPrimary:false},
      });
      const created=await tx.componentVisual.create({data:{
        assetId:asset.id,componentId,visualType:'photo',title,
        imageUrl:'/private-component-photos/'+filename,
        sourceProvider:'uploaded',isPrimary:true,createdById:session.userId,
      }});
      await tx.auditLog.create({data:{userId:session.userId,action:'create',
        entityType:'component_visual',entityId:created.id,plantId:asset.plantId,
        newValues:JSON.stringify({assetId,componentId,visualType:'photo',source:'customer_uploaded_photo',sizeBytes:data.length})}});
      return created;
    },{timeout:15000});
    return NextResponse.json({success:true,data:visual},{status:201});
  } catch(error){await unlink(fullPath).catch(()=>{});throw error;}
 }catch(error){
  const message=error instanceof Error?error.message:'Photo upload failed';
  return NextResponse.json({success:false,error:message},{status:500});
 }
}
