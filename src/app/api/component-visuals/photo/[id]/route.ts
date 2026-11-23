import {NextRequest,NextResponse} from 'next/server';
import {open} from 'node:fs/promises';
import {constants} from 'node:fs';
import path from 'node:path';
import {db} from '@/lib/db';
import {getSession,hasPermission,isAdmin} from '@/lib/auth';
import {getPlantScope,canAccessPlantStrict} from '@/lib/plant-scope';
import {privateComponentPhotoRoot,validPrivatePhotoFilename,privatePhotoMime} from '@/lib/component-private-photos';

export const runtime='nodejs';
export const dynamic='force-dynamic';

/** Authenticated plant-scoped image bytes. An unguessable URL alone is NOT authorization. */
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const session=getSession(request);
 if(!session)return NextResponse.json({success:false,error:'Not authenticated'},{status:401});
 if(!isAdmin(session)&&!hasPermission(session,'assets.view')&&
    !hasPermission(session,'digital_twin.view')&&!hasPermission(session,'assets.view_all')){
   return NextResponse.json({success:false,error:'Asset viewing permission required'},{status:403});
 }
 try{
  const {id}=await params;
  const photo=await db.componentVisual.findUnique({where:{id},
    select:{assetId:true,imageUrl:true,visualType:true,sourceProvider:true}});
  if(!photo||!photo.assetId||photo.visualType!=='photo'||photo.sourceProvider!=='uploaded')
    return NextResponse.json({success:false,error:'Factory photo not found'},{status:404});
  const asset=await db.asset.findUnique({where:{id:photo.assetId},
    select:{plantId:true,isActive:true}});
  const scope=await getPlantScope(request,session);
  if(!asset||!asset.isActive||!canAccessPlantStrict(scope,asset.plantId))
    return NextResponse.json({success:false,error:'Factory photo not accessible'},{status:403});
  const prefix='/private-component-photos/';
  if(!photo.imageUrl.startsWith(prefix))
    return NextResponse.json({success:false,error:'Photo storage path is invalid'},{status:404});
  const filename=photo.imageUrl.slice(prefix.length);
  if(!validPrivatePhotoFilename(filename))
    return NextResponse.json({success:false,error:'Photo file is invalid'},{status:404});
  const mime=privatePhotoMime(filename);
  if(!mime)return NextResponse.json({success:false,error:'Unsupported photo type'},{status:415});
  // Never follow a substituted symlink or serve a non-image-sized local file.
  const handle=await open(path.join(privateComponentPhotoRoot(),filename),constants.O_RDONLY|constants.O_NOFOLLOW);
  let data:Buffer;
  try{
    const info=await handle.stat();
    if(!info.isFile()||info.size<16||info.size>10*1024*1024)
      return NextResponse.json({success:false,error:'Factory photo not found'},{status:404});
    data=await handle.readFile();
  }finally{await handle.close();}
  return new NextResponse(new Uint8Array(data),{status:200,headers:{
    'Content-Type':mime,
    'Content-Length':String(data.length),
    'Cache-Control':'private, no-store, max-age=0',
    'X-Content-Type-Options':'nosniff',
  }});
 }catch{
  return NextResponse.json({success:false,error:'Factory photo not found'},{status:404});
 }
}
