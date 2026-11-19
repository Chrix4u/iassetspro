import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { NextRequest } from 'next/server';

const mocked = vi.hoisted(() => ({
  getSession: vi.fn(),
  hasPermission: vi.fn(),
  isAdmin: vi.fn(),
  getPlantScope: vi.fn(),
  canAccessPlantStrict: vi.fn(),
  findUnique: vi.fn(),
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
  db: { assetModel: { findUnique: mocked.findUnique } },
}));

import { GET } from '@/app/api/smart-anatomy/models/[id]/file/route';

const id = 'f4f9438d-5e92-499a-9abf-b66d6ba591ca';
const filePath = '/api/smart-anatomy/models/' + id + '/file';
const req = () => new NextRequest('http://localhost' + filePath);
const params = { params: Promise.resolve({ id }) };
const fixture = readFileSync('public/smart-anatomy-demos/original-centrifugal-pump.glb');

let directory: string;
let previousRoot: string | undefined;

beforeAll(async () => {
  previousRoot = process.env.IASSETSPRO_CAD_STORAGE_ROOT;
  directory = await mkdtemp(join(tmpdir(), 'smart-anatomy-api-test-'));
  process.env.IASSETSPRO_CAD_STORAGE_ROOT = directory;
  await writeFile(join(directory, id + '.glb'), fixture);
});

afterAll(async () => {
  if (previousRoot === undefined) delete process.env.IASSETSPRO_CAD_STORAGE_ROOT;
  else process.env.IASSETSPRO_CAD_STORAGE_ROOT = previousRoot;
  await rm(directory, { recursive: true, force: true });
});

beforeEach(() => {
  vi.clearAllMocks();
  mocked.getSession.mockReturnValue({ userId: 'tech-1' });
  mocked.hasPermission.mockReturnValue(true);
  mocked.isAdmin.mockReturnValue(false);
  mocked.getPlantScope.mockResolvedValue({ denyAccess: false, plantId: 'plant-a' });
  mocked.canAccessPlantStrict.mockImplementation((_scope: unknown, plantId: string) => plantId === 'plant-a');
  mocked.findUnique.mockResolvedValue({
    id, filePath, fileSize: fixture.length,
    asset: { plantId: 'plant-a' },
  });
});

describe('private CAD binary access, end-to-end route behavior with mocked identity', () => {
  it('returns 401 without a session, and does not query the database', async () => {
    mocked.getSession.mockReturnValue(null);
    const response = await GET(req(), params);
    expect(response.status).toBe(401);
    expect(mocked.findUnique).not.toHaveBeenCalled();
  });

  it('returns 403 without the Digital Twin view permission', async () => {
    mocked.hasPermission.mockReturnValue(false);
    const response = await GET(req(), params);
    expect(response.status).toBe(403);
    expect(mocked.findUnique).not.toHaveBeenCalled();
  });

  it('does not disclose content across plants, even when the UUID is known', async () => {
    mocked.findUnique.mockResolvedValue({
      id, filePath, fileSize: fixture.length, asset: { plantId: 'plant-b' },
    });
    const response = await GET(req(), params);
    expect(response.status).toBe(403);
    expect(mocked.canAccessPlantStrict).toHaveBeenCalled();
    expect(response.headers.get('content-type')).toContain('application/json');
  });

  it('does not serve a model whose database path is not the canonical private route', async () => {
    mocked.findUnique.mockResolvedValue({
      id, filePath: '/uploads/another-model.glb',
      fileSize: fixture.length, asset: { plantId: 'plant-a' },
    });
    const response = await GET(req(), params);
    expect(response.status).toBe(404);
  });

  it('returns authorized binary bytes without making them public or cacheable', async () => {
    const response = await GET(req(), params);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('content-type')).toContain('gltf-binary');
    const received = Buffer.from(await response.arrayBuffer());
    expect(received.equals(fixture)).toBe(true);
  });

  it('refuses to serve mismatched bytes when metadata or disk content differs', async () => {
    mocked.findUnique.mockResolvedValue({
      id, filePath, fileSize: fixture.length + 1,
      asset: { plantId: 'plant-a' },
    });
    const response = await GET(req(), params);
    expect(response.status).toBe(409);
  });
});
