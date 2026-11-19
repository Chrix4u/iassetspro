#!/usr/bin/env node
/**
 * Read-only evidence gate for encrypted CAD backups.
 * A passing result verifies a local encrypted artifact's digest and metadata,
 * NOT an off-site replica or successful restoration.
 *
 * IASSETSPRO_CAD_BACKUP_EVIDENCE=/absolute/path/evidence.json \
 *   node scripts/smart-anatomy/verify-backup-evidence.mjs
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, resolve, dirname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

function requireAbsolute(value,label){
  if(typeof value!=='string'||!isAbsolute(value))throw new Error(label+' must be absolute');
  return resolve(value);
}
function assertHash(value){
  if(typeof value!=='string'||!/^[a-f0-9]{64}$/i.test(value)){
    throw new Error('Expected a 64-character SHA-256 hex digest');
  }
  return Buffer.from(value,'hex');
}
async function assertPrivateRegularFile(path,label){
  const stat=await lstat(path);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1){
    throw new Error(label+' must be a regular, unlinked, non-symlink file');
  }
  if((stat.mode & 0o077)!==0){
    throw new Error(label+' must have owner-only file permissions (0600)');
  }
  if(typeof process.getuid==='function'&&stat.uid!==process.getuid()){
    throw new Error(label+' must be owned by the verifying runtime user');
  }
  if(await realpath(path)!==path)throw new Error(label+' has a symlinked ancestor');
  return stat;
}
export async function verifyBackupEvidence(manifestPath,{
  output=console, now=new Date(),
}={}){
  const manifest=requireAbsolute(manifestPath,'Backup evidence path');
  const manifestStat=await assertPrivateRegularFile(manifest,'Evidence manifest');
  if(manifestStat.size>64*1024)throw new Error('Evidence manifest is too large');
  let evidence;
  try{evidence=JSON.parse(await readFile(manifest,'utf8'));}
  catch{throw new Error('Evidence manifest must contain valid JSON');}
  if(evidence?.schemaVersion!==1||evidence.encryption?.enabled!==true||
      !['age','gpg','restic'].includes(evidence.encryption?.format)){
    throw new Error('A supported encrypted backup artifact is required');
  }
  if(evidence.encryption?.recipientCount<1 ||
      !Number.isSafeInteger(evidence.encryption.recipientCount)){
    throw new Error('Encryption recipient count must be a positive integer');
  }
  if(evidence.containsSecrets===true||evidence.includesDatabaseCredentials===true){
    throw new Error('Evidence explicitly contains prohibited credentials');
  }
  const source=requireAbsolute(evidence.sourceCadRoot,'Source CAD root');
  const archive=requireAbsolute(evidence.encryptedArtifact?.path,'Encrypted artifact');
  if(source===archive||archive.startsWith(source+sep)){
    throw new Error('Backup artifact cannot be stored inside the live CAD source directory');
  }
  if(archive===manifest||archive===dirname(manifest)){
    throw new Error('Invalid backup artifact path');
  }
  const expected=assertHash(evidence.encryptedArtifact?.sha256);
  const stat=await assertPrivateRegularFile(archive,'Encrypted artifact');
  if(!Number.isSafeInteger(evidence.encryptedArtifact?.sizeBytes)||
      evidence.encryptedArtifact.sizeBytes<=0||
      stat.size!==evidence.encryptedArtifact.sizeBytes){
    throw new Error('Encrypted artifact size mismatch');
  }
  const timestamp=new Date(evidence.createdAt);
  if(!Number.isFinite(timestamp.getTime())||timestamp>now ||
      now.getTime()-timestamp.getTime()>30*24*3600*1000){
    throw new Error('Backup timestamp must be within the last 30 days');
  }
  const digest=createHash('sha256');
  for await(const chunk of createReadStream(archive)){digest.update(chunk);}
  if(!timingSafeEqual(digest.digest(),expected)){
    throw new Error('Encrypted artifact SHA-256 mismatch');
  }
  output.log('[CAD backup] PASS: local artifact privacy, declared encryption metadata, size and SHA-256 match');
  output.log('[CAD backup] NOT VERIFIED: cryptographic encryption validity, remote/off-site replication, decryption, PostgreSQL consistency, restore drill or actual OEM provenance');
  return {verifiedLocalEncryptedArtifact:true,verifiedOffsite:false,verifiedRestore:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  try{await verifyBackupEvidence(process.env.IASSETSPRO_CAD_BACKUP_EVIDENCE);}
  catch(error){
    console.error('[CAD backup] FAIL:',error instanceof Error?error.message:String(error));
    process.exitCode=1;
  }
}
