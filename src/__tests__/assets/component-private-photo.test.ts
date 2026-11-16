import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {validPrivatePhotoFilename,privatePhotoMime} from '@/lib/component-private-photos';
const source=(p:string)=>readFileSync(p,'utf8');
describe('private plant-scoped factory photos',()=>{
 it('uses strict unguessable server-generated names, not user paths',()=>{
  expect(validPrivatePhotoFilename('factory-photo-123e4567-e89b-12d3-a456-426614174000.png')).toBe(true);
  expect(validPrivatePhotoFilename('factory-photo-123e4567-e89b-12d3-a456-426614174000.jpg')).toBe(true);
  expect(validPrivatePhotoFilename('../private-component-photos/secret.png')).toBe(false);
  expect(validPrivatePhotoFilename('factory-photo-evil.svg')).toBe(false);
  expect(privatePhotoMime('factory-photo-123e4567-e89b-12d3-a456-426614174000.png')).toBe('image/png');
 });
 it('keeps file bytes outside the public generated-assets tree',()=>{
  const write=source('src/app/api/component-visuals/upload/route.ts');
  const serve=source('src/app/api/component-visuals/photo/[id]/route.ts');
  const storage=source('src/lib/component-private-photos.ts');
  expect(write).toContain('privateComponentPhotoRoot()');
  expect(write).not.toContain("'/api/generated-assets/component-visuals/'");
  expect(storage).toContain("'private-component-photos'");
  expect(storage).not.toContain("'public','generated-assets','private-component-photos'");
  expect(serve).toContain('getSession(request)');
  expect(serve).toContain('canAccessPlantStrict(scope,asset.plantId)');
  expect(serve).toContain('validPrivatePhotoFilename(filename)');
  expect(serve).toContain("'Cache-Control':'private, no-store, max-age=0'");
  expect(path.isAbsolute('/tmp/private-component-photos')).toBe(true);
 });
 it('loads images with authenticated bearer API requests rather than unauthenticated img URLs',()=>{
  const explorer=source('src/components/digital-twin/MachineVisualExplorer.tsx');
  expect(explorer).toContain("api.getRaw('/api/component-visuals/photo/'");
  expect(explorer).toContain('URL.createObjectURL(blob)');
  expect(explorer).toContain('URL.revokeObjectURL(objectUrl)');
  expect(explorer).toContain('Upload real photo');
 });
});
