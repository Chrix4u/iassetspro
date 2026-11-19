// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chmod, mkdtemp, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { assertPrivateCadStorageReady, privateCadStorageRoot } from '@/lib/smart-anatomy/private-cad-storage';

let directory: string;
let parent: string;
let previous: string | undefined;
const setRoot = (root: string) => { process.env.IASSETSPRO_CAD_STORAGE_ROOT = root; };

beforeAll(async () => {
  previous=process.env.IASSETSPRO_CAD_STORAGE_ROOT;
  parent=await mkdtemp(join(tmpdir(),'smart-anatomy-storage-'));
  directory=await mkdtemp(join(parent,'root-'));
});
afterAll(async () => {
  if(previous === undefined) delete process.env.IASSETSPRO_CAD_STORAGE_ROOT;
  else process.env.IASSETSPRO_CAD_STORAGE_ROOT=previous;
  await rm(parent,{recursive:true,force:true});
});

describe('Smart Anatomy runtime private CAD directory guards', () => {
  it('accepts an owner-only real persistent directory', async () => {
    setRoot(directory);
    expect(privateCadStorageRoot()).toBe(directory);
    await expect(assertPrivateCadStorageReady(directory)).resolves.toBeUndefined();
  });

  it('fails closed if an operator accidentally makes the CAD storage readable by other users', async () => {
    setRoot(directory);
    await chmod(directory,0o750);
    try {
      await expect(assertPrivateCadStorageReady(directory)).rejects.toThrow('owner-only');
    } finally {
      await chmod(directory,0o700);
    }
  });

  it('rejects a symlinked storage directory even if its destination is secure', async () => {
    const shortcut=join(parent,'storage-symlink');
    await symlink(directory,shortcut);
    setRoot(shortcut);
    await expect(assertPrivateCadStorageReady(shortcut)).rejects.toThrow('actual directory');
  });

  it('rejects storage paths that are not the exact configured absolute path', async () => {
    setRoot(directory);
    await expect(assertPrivateCadStorageReady('/tmp')).rejects.toThrow('configured');
  });
});
