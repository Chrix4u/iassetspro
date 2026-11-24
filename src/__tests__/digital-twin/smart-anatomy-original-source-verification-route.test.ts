// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { File as NodeFile } from 'node:buffer';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const mocked=vi.hoisted(()=>({
  getSession:vi.fn(),hasPermission:vi.fn(),isAdmin:vi.fn(),
  getPlantScope:vi.fn(),canAccessPlantStrict:vi.fn(),
  modelFindUnique:vi.fn(),auditFindFirst:vi.fn(),auditCreate:vi.fn(),
  transaction:vi.fn(),queryRaw:vi.fn(),
}));
vi.mock('@/lib/auth',()=>({
  getSession:mocked.getSession,hasPermission:mocked.hasPermission,isAdmin:mocked.isAdmin,
}));
vi.mock('@/lib/plant-scope',()=>({
  getPlantScope:mocked.getPlantScope,canAccessPlantStrict:mocked.canAccessPlantStrict,
}));
vi.mock('@/lib/db',()=>({
  db:{
    assetModel:{findUnique:mocked.modelFindUnique},
    auditLog:{findFirst:mocked.auditFindFirst,create:mocked.auditCreate},
    $transaction:mocked.transaction,
  },
}));
import { POST } from '@/app/api/smart-anatomy/models/[id]/verify-source/route';

const id='f4f9438d-5e92-499a-9abf-b66d6ba591ca';
const bytes=readFileSync('public/smart-anatomy-demos/original-centrifugal-pump.glb');
const original=Buffer.from('ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((\'authorized fixture\'),\'2;1\');\nENDSEC;\nEND-ISO-10303-21;\n');
const hash=(x:Uint8Array)=>createHash('sha256').update(x).digest('hex');
const ctx={params:Promise.resolve({id})};
const model={
  id,assetId:'asset-1',isActive:false,uploadedById:'uploader-1',
  filePath:'/api/smart-anatomy/models/'+id+'/file',
  fileSize:bytes.length,
  asset:{plantId:'plant-1'},
};
const audited={
  checksum:hash(bytes),
  conversionEvidence:{
    sourceFileName:'actual-source.step',
    sourceSha256:hash(original),
    sourceByteLength:original.length,
    sourceOrigin:'licensed-oem',
    glbSha256:hash(bytes),
  },
};
function request(data:Uint8Array=original,fileName='actual-source.step') {
  const form=new FormData();
  form.set('sourceFile',new NodeFile([new Uint8Array(data)],fileName,{
    type:'application/octet-stream',
  }) as unknown as Blob,fileName);
  return new NextRequest('http://localhost/api/smart-anatomy/models/'+id+'/verify-source',{
    method:'POST',body:form,
  });
}
let folder:string;let old:string|undefined;
beforeAll(async()=>{
  old=process.env.IASSETSPRO_CAD_STORAGE_ROOT;
  folder=await mkdtemp(join(tmpdir(),'iassetspro-cad-original-'));
  process.env.IASSETSPRO_CAD_STORAGE_ROOT=folder;
  await writeFile(join(folder,id+'.glb'),bytes,{mode:0o600});
});
afterAll(async()=>{
  if(old===undefined)delete process.env.IASSETSPRO_CAD_STORAGE_ROOT;
  else process.env.IASSETSPRO_CAD_STORAGE_ROOT=old;
  await rm(folder,{recursive:true,force:true});
});
beforeEach(()=>{
  vi.clearAllMocks();
  mocked.getSession.mockReturnValue({userId:'checker-2'});
  mocked.hasPermission.mockReturnValue(true);
  mocked.isAdmin.mockReturnValue(false);
  mocked.getPlantScope.mockResolvedValue({denyAccess:false,plantId:'plant-1'});
  mocked.canAccessPlantStrict.mockImplementation((_scope:unknown,plantId:string)=>plantId==='plant-1');
  mocked.modelFindUnique.mockResolvedValue(model);
  mocked.auditFindFirst.mockImplementation(({where}:{where:{action:string}})=>
    Promise.resolve(where.action==='withdraw'?null:{newValues:JSON.stringify(audited)}));
  mocked.auditCreate.mockResolvedValue({id:'source-verified-audit'});
  mocked.queryRaw.mockResolvedValue([{id}]);
  mocked.transaction.mockImplementation(async(callback:(tx:unknown)=>Promise<unknown>)=>
    callback({
      $queryRaw:mocked.queryRaw,
      assetModel:{findUnique:mocked.modelFindUnique},
      auditLog:{findFirst:mocked.auditFindFirst,create:mocked.auditCreate},
    }));
});

describe('independent private original CAD source checksum verification',()=>{
  it('checks retained source bytes and GLB without saving original CAD',async()=>{
    const res=await POST(request(),ctx);
    expect(res.status).toBe(200);
    const json=await res.json();
    expect(json.data.originalSourceDigestMatched).toBe(true);
    expect(json.data.originalCadStored).toBe(false);
    expect(json.data.manufacturerAuthenticityCertified).toBe(false);
    expect(mocked.queryRaw).toHaveBeenCalledOnce();
    const audit=JSON.parse(mocked.auditCreate.mock.calls[0][0].data.newValues);
    expect(audit.independentlyComparedOriginalCadBytes).toBe(true);
    expect(audit.originalSourceStoredOnServer).toBe(false);
    expect(audit.claimedOemLicenceOrMachineAuthenticityVerified).toBe(false);
    expect(audit.sourceSha256).toBe(hash(original));
    expect(await readdir(folder)).toEqual([id+'.glb']);
  });
  it('refuses tampered source bytes, incorrect filename and missing conversion manifest',async()=>{
    const different=Buffer.from(original);
    different[8]^=1;
    const bad=await POST(request(different),ctx);
    expect(bad.status).toBe(409);
    expect(mocked.auditCreate).not.toHaveBeenCalled();
    expect((await POST(request(original,'wrong-source.step'),ctx)).status).toBe(400);
    mocked.auditFindFirst.mockResolvedValue({newValues:'{}'});
    expect((await POST(request(),ctx)).status).toBe(409);
    expect(mocked.auditCreate).not.toHaveBeenCalled();
  });
  it('refuses uploader self-certification and cross-plant source access',async()=>{
    mocked.getSession.mockReturnValue({userId:'uploader-1'});
    expect((await POST(request(),ctx)).status).toBe(409);
    expect(mocked.auditCreate).not.toHaveBeenCalled();
    mocked.getSession.mockReturnValue({userId:'checker-2'});
    mocked.canAccessPlantStrict.mockReturnValue(false);
    expect((await POST(request(),ctx)).status).toBe(403);
    expect(mocked.auditCreate).not.toHaveBeenCalled();
  });
  it('refuses unauthenticated source upload and withdrawn revision',async()=>{
    mocked.getSession.mockReturnValue(null);
    expect((await POST(request(),ctx)).status).toBe(401);
    mocked.getSession.mockReturnValue({userId:'checker-2'});
    mocked.auditFindFirst.mockImplementation(({where}:{where:{action:string}})=>
      Promise.resolve(where.action==='withdraw'?{id:'withdrawal'}:{newValues:JSON.stringify(audited)}));
    expect((await POST(request(),ctx)).status).toBe(409);
  });
});
