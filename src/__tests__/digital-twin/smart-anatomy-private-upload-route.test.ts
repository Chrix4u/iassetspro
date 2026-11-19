// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';
import { File as NodeFile } from 'node:buffer';

const mocked = vi.hoisted(() => ({
  getSession: vi.fn(),
  hasPermission: vi.fn(),
  isAdmin: vi.fn(),
  getPlantScope: vi.fn(),
  canAccessPlantStrict: vi.fn(),
  assetFindUnique: vi.fn(),
  modelCreate: vi.fn(),
  auditCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  getSession: mocked.getSession,
  hasPermission: mocked.hasPermission,
  isAdmin: mocked.isAdmin,
}));
vi.mock('@/lib/plant-scope', () => ({
  getPlantScope: mocked.getPlantScope,
  canAccessPlantStrict: mocked.canAccessPlantStrict,
}));
vi.mock('@/lib/db', () => ({
  db: {
    asset: { findUnique: mocked.assetFindUnique },
    assetModel: { create: mocked.modelCreate },
    auditLog: { create: mocked.auditCreate },
    $transaction: mocked.transaction,
  },
}));

import { POST } from '@/app/api/smart-anatomy/models/route';

const file = readFileSync('public/smart-anatomy-demos/original-centrifugal-pump.glb');
let storage: string;
let priorEnv: string | undefined;

function request(data = file, name = 'OriginalPump.glb') {
  const form = new FormData();
  form.set('assetId', 'machine-1');
  form.set('name', 'Plant Pump · authorized original training model');
  form.set('sourceOrigin', 'original-training');
  form.set('sourceNote', 'Original training geometry created by this organization');
  // Node's runtime File is correct for multipart serialization; TS' DOM FormData
  // overload declares a different Blob interface in this mixed test project.
  form.set('file', new NodeFile([new Uint8Array(data)], name, { type: 'model/gltf-binary' }) as unknown as Blob, name);
  return new NextRequest('http://localhost/api/smart-anatomy/models', {
    method: 'POST', body: form,
  });
}

beforeAll(async () => {
  priorEnv = process.env.IASSETSPRO_CAD_STORAGE_ROOT;
  storage = await mkdtemp(join(tmpdir(), 'smart-anatomy-private-upload-'));
  process.env.IASSETSPRO_CAD_STORAGE_ROOT = storage;
});

afterAll(async () => {
  if(priorEnv === undefined) delete process.env.IASSETSPRO_CAD_STORAGE_ROOT;
  else process.env.IASSETSPRO_CAD_STORAGE_ROOT = priorEnv;
  await rm(storage, { recursive: true, force: true });
});

beforeEach(async () => {
  vi.clearAllMocks();
  for(const item of await readdir(storage)) await rm(join(storage, item), {force: true});
  mocked.getSession.mockReturnValue({ userId: 'engineer-1' });
  mocked.hasPermission.mockReturnValue(true);
  mocked.isAdmin.mockReturnValue(false);
  mocked.getPlantScope.mockResolvedValue({ denyAccess: false, plantId: 'plant-1' });
  mocked.canAccessPlantStrict.mockImplementation((_scope: unknown, id: string) => id === 'plant-1');
  mocked.assetFindUnique.mockResolvedValue({ id:'machine-1', plantId:'plant-1' });
  mocked.modelCreate.mockImplementation(async ({data}: { data: Record<string, unknown> })=>({...data}));
  mocked.auditCreate.mockResolvedValue({ id:'audit-1' });
  mocked.transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
});

describe('Smart Anatomy private GLB upload API, executable multipart tests', () => {
  it('rejects unauthenticated upload before database or filesystem writes', async () => {
    mocked.getSession.mockReturnValue(null);
    const res = await POST(request());
    expect(res.status).toBe(401);
    expect(mocked.assetFindUnique).not.toHaveBeenCalled();
    expect(await readdir(storage)).toHaveLength(0);
  });

  it('rejects a user from another plant before writing any CAD bytes', async () => {
    mocked.assetFindUnique.mockResolvedValue({id:'machine-1',plantId:'other-plant'});
    const res=await POST(request());
    expect(res.status).toBe(403);
    expect(mocked.modelCreate).not.toHaveBeenCalled();
    expect(await readdir(storage)).toHaveLength(0);
  });

  it('rejects invalid binary contents and does not create orphaned database records', async () => {
    const res=await POST(request(Buffer.from('not a valid GLB')));
    expect(res.status).toBe(400);
    expect(mocked.modelCreate).not.toHaveBeenCalled();
    expect(await readdir(storage)).toHaveLength(0);
  });

  it('writes real GLB to private UUID storage and registers an inactive audited asset model', async () => {
    const res=await POST(request());
    expect(res.status).toBe(201);
    const json=await res.json();
    expect(json.success).toBe(true);
    expect(json.data.meshCount).toBe(30);
    expect(json.data.commissioned).toBe(false);
    const args=mocked.modelCreate.mock.calls[0][0].data as Record<string, unknown>;
    expect(args.assetId).toBe('machine-1');
    expect(args.isActive).toBe(false);
    expect(args.filePath).toBe('/api/smart-anatomy/models/'+args.id+'/file');
    const disk=join(storage,String(args.id)+'.glb');
    expect(Buffer.from(await readFile(disk)).equals(file)).toBe(true);
    expect(mocked.auditCreate).toHaveBeenCalled();
  });
});
