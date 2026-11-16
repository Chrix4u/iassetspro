import path from 'node:path';

/** Persistent private photo storage, intentionally outside public/generated-assets. */
export function privateComponentPhotoRoot():string {
  if(process.env.COMPONENT_PHOTOS_DIR){
    return path.resolve(process.env.COMPONENT_PHOTOS_DIR);
  }
  if(process.env.GENERATED_ASSETS_DIR){
    return path.resolve(process.env.GENERATED_ASSETS_DIR,'..','private-component-photos');
  }
  return path.resolve(process.cwd(),'private-component-photos');
}
export function validPrivatePhotoFilename(filename:string):boolean{
  return /^factory-photo-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/.test(filename);
}
export function privatePhotoMime(filename:string):string|null{
  return filename.endsWith('.png')?'image/png':
    filename.endsWith('.jpg')?'image/jpeg':
    filename.endsWith('.webp')?'image/webp':null;
}
