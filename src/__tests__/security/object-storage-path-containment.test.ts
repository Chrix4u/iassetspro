import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'fs/promises';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

let storageDir = '';

beforeEach(async () => {
  storageDir = await mkdtemp(join(tmpdir(), 'iassetspro-storage-'));
  vi.stubEnv('STORAGE_PATH', storageDir);
  vi.resetModules();
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.resetModules();
  if (storageDir) await rm(storageDir, { recursive: true, force: true });
});

describe('ObjectStorageService path containment', () => {
  it('rejects parent traversal and backslash traversal before filesystem access', async () => {
    const { InvalidStorageKeyError, ObjectStorageService } = await import('@/services/objectStorage.service');
    const body = Buffer.from('blocked');

    await expect(ObjectStorageService.upload('../escape.txt', body, 'text/plain'))
      .rejects.toBeInstanceOf(InvalidStorageKeyError);
    await expect(ObjectStorageService.download('work-orders/../../escape.txt'))
      .rejects.toBeInstanceOf(InvalidStorageKeyError);
    await expect(ObjectStorageService.delete('..\\escape.txt'))
      .rejects.toBeInstanceOf(InvalidStorageKeyError);
    await expect(ObjectStorageService.exists('/absolute/path.txt'))
      .rejects.toBeInstanceOf(InvalidStorageKeyError);

    expect(existsSync(join(storageDir, '..', 'escape.txt'))).toBe(false);
  });

  it('preserves normal nested object storage behavior', async () => {
    const { ObjectStorageService } = await import('@/services/objectStorage.service');
    const key = 'work-orders/2026/10/05/evidence.txt';
    const body = Buffer.from('safe evidence');

    const uploaded = await ObjectStorageService.upload(key, body, 'text/plain');
    expect(uploaded.key).toBe(key);
    expect(await readFile(join(storageDir, key), 'utf8')).toBe('safe evidence');

    const downloaded = await ObjectStorageService.download(key);
    expect(downloaded?.buffer.toString('utf8')).toBe('safe evidence');
    expect(downloaded?.mimeType).toBe('text/plain');
  });

  it('sanitizes generated file extensions and rejects unsafe prefixes', async () => {
    const { InvalidStorageKeyError, ObjectStorageService } = await import('@/services/objectStorage.service');

    const key = ObjectStorageService.generateKey('work-orders/wo-1', 'photo.JP%G');
    expect(key).toMatch(/^work-orders\/wo-1\/\d{4}\/\d{2}\/\d{2}\/[a-f0-9]{16}\.jpg$/);
    expect(() => ObjectStorageService.generateKey('../outside', 'photo.jpg'))
      .toThrow(InvalidStorageKeyError);
  });
});
