/**
 * Read-only production release gate for the private CAD storage root.
 * Does not create the root; the release operator must provision it separately.
 * No CAD files or tenant records are inspected.
 *
 * IASSETSPRO_CAD_STORAGE_ROOT=/absolute/private/dir node scripts/smart-anatomy/check-private-cad-storage.mjs
 */
import { access, lstat, realpath, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { resolve, isAbsolute, sep, join } from 'node:path';

const configured=process.env.IASSETSPRO_CAD_STORAGE_ROOT?.trim();
if(!configured || !isAbsolute(configured)){
  console.error('[CAD preflight] IASSETSPRO_CAD_STORAGE_ROOT must be an absolute, non-public directory');
  process.exit(1);
}
try{
  const path=resolve(configured);
  const stat=await lstat(path);
  if(!stat.isDirectory() || stat.isSymbolicLink()){
    throw new Error('Storage root must be a real directory, not a symlink');
  }
  const realRoot=await realpath(path);
  const publicRoot=await realpath(join(process.cwd(),'public'));
  if(realRoot===publicRoot || realRoot.startsWith(publicRoot+sep)){
    throw new Error('Private CAD cannot be stored beneath the public web root');
  }
  if((stat.mode & 0o077)!==0){
    throw new Error('Private CAD directory must have owner-only permissions (chmod 700)');
  }
  await access(realRoot,constants.R_OK|constants.W_OK|constants.X_OK);
  const temp=await mkdtemp(join(realRoot,'.cad-preflight-'));
  try{await writeFile(join(temp,'write-test'),Buffer.from('private-storage-check'),{mode:0o600,flag:'wx'});}
  finally{await rm(temp,{recursive:true,force:true});}
  console.log('[CAD preflight] PRIVATE STORAGE OK: writable, non-public, owner-only, persistent path configured');
}catch(error){
  console.error('[CAD preflight] FAIL:',error instanceof Error?error.message:String(error));
  process.exit(1);
}
