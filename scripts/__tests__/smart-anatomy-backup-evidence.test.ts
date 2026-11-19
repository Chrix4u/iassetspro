import { describe,expect,it,afterEach } from 'vitest';
import { mkdtemp,chmod,writeFile,rm,symlink } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyBackupEvidence } from '../smart-anatomy/verify-backup-evidence.mjs';

const roots:string[]=[];
afterEach(async()=>{for(const root of roots.splice(0))await rm(root,{recursive:true,force:true});});
async function fixture(){
  const root=await mkdtemp(join(tmpdir(),'cad-backup-evidence-'));
  roots.push(root);
  const artifact=join(root,'cad-20261119.age');
  const manifest=join(root,'evidence.json');
  const data=Buffer.from('synthetic encrypted backup fixture, not real OEM data');
  await writeFile(artifact,data,{mode:0o600});
  const evidence={
    schemaVersion:1,createdAt:'2026-11-19T12:00:00.000Z',
    sourceCadRoot:join(root,'live-cad'),
    encryption:{enabled:true,format:'age',recipientCount:1},
    encryptedArtifact:{
      path:artifact,sizeBytes:data.length,
      sha256:createHash('sha256').update(data).digest('hex'),
    },
  };
  const save=async()=>writeFile(manifest,JSON.stringify(evidence),{mode:0o600});
  await save();
  return {root,artifact,manifest,evidence,save};
}
const now=new Date('2026-11-19T14:00:00.000Z');
const output: Console={...console,log:()=>{}};
describe('non-destructive encrypted CAD backup evidence gate',()=>{
  it('verifies local encrypted artifact and explicitly refuses offsite/restore claims',async()=>{
    const f=await fixture();
    expect(await verifyBackupEvidence(f.manifest,{now,output})).toEqual({
      verifiedLocalEncryptedArtifact:true,verifiedOffsite:false,verifiedRestore:false,
    });
  });
  it('rejects modified or truncated encrypted backups',async()=>{
    const f=await fixture();
    await writeFile(f.artifact,'altered bytes',{mode:0o600});
    await expect(verifyBackupEvidence(f.manifest,{now,output})).rejects.toThrow('size mismatch');
    f.evidence.encryptedArtifact.sizeBytes=13;
    await f.save();
    await expect(verifyBackupEvidence(f.manifest,{now,output})).rejects.toThrow('SHA-256 mismatch');
  });
  it('rejects plaintext or missing encryption recipients',async()=>{
    const f=await fixture();
    f.evidence.encryption.enabled=false;
    await f.save();
    await expect(verifyBackupEvidence(f.manifest,{now,output})).rejects.toThrow('encrypted backup');
    f.evidence.encryption.enabled=true;
    f.evidence.encryption.recipientCount=0;
    await f.save();
    await expect(verifyBackupEvidence(f.manifest,{now,output})).rejects.toThrow('recipient');
  });
  it('rejects stale timestamps, backup inside live source and declared credentials',async()=>{
    const f=await fixture();
    f.evidence.createdAt='2026-09-01T00:00:00Z';
    await f.save();
    await expect(verifyBackupEvidence(f.manifest,{now,output})).rejects.toThrow('30 days');
    f.evidence.createdAt='2026-11-19T12:00:00Z';
    f.evidence.sourceCadRoot=f.root;
    await f.save();
    await expect(verifyBackupEvidence(f.manifest,{now,output})).rejects.toThrow('live CAD source');
    f.evidence.sourceCadRoot=join(f.root,'live-cad');
    Object.assign(f.evidence,{includesDatabaseCredentials:true});
    await f.save();
    await expect(verifyBackupEvidence(f.manifest,{now,output})).rejects.toThrow('credentials');
  });
  it('rejects symlinks and nonprivate backup files',async()=>{
    const f=await fixture();
    const alias=join(f.root,'linked.age');
    await symlink(f.artifact,alias);
    f.evidence.encryptedArtifact.path=alias;
    await f.save();
    await expect(verifyBackupEvidence(f.manifest,{now,output})).rejects.toThrow('non-symlink');
    f.evidence.encryptedArtifact.path=f.artifact;
    await f.save();
    await chmod(f.artifact,0o644);
    await expect(verifyBackupEvidence(f.manifest,{now,output})).rejects.toThrow('owner-only');
  });
  it('rejects missing or relative manifest paths',async()=>{
    await expect(verifyBackupEvidence('relative.json',{now,output})).rejects.toThrow('absolute');
  });
});
