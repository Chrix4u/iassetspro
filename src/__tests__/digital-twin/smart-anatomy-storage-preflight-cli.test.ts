// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script='scripts/smart-anatomy/check-private-cad-storage.mjs';

function preflight(root:string) {
  return spawnSync(process.execPath,[script],{
    cwd:process.cwd(),
    env:{...process.env,IASSETSPRO_CAD_STORAGE_ROOT:root},
    encoding:'utf8',
    timeout:10000,
  });
}

describe('private Smart Anatomy CAD storage deployment preflight',()=>{
  it('permits an explicitly provisioned private owner-only directory',()=>{
    const folder=mkdtempSync(join(tmpdir(),'cad-owner-preflight-'));
    try {
      chmodSync(folder,0o700);
      const result=preflight(folder);
      expect(result.status,result.stderr).toBe(0);
      expect(result.stdout).toContain('PRIVATE STORAGE OK');
    } finally {rmSync(folder,{recursive:true,force:true});}
  });

  it('refuses directories readable by other VPS users',()=>{
    const folder=mkdtempSync(join(tmpdir(),'cad-world-preflight-'));
    try {
      chmodSync(folder,0o755);
      const result=preflight(folder);
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain('owner-only');
    } finally {rmSync(folder,{recursive:true,force:true});}
  });

  it('refuses storage paths with symlinks in any ancestor',()=>{
    const base=mkdtempSync(join(tmpdir(),'cad-alias-preflight-'));
    try {
      mkdirSync(join(base,'real'),{mode:0o700});
      symlinkSync(join(base,'real'),join(base,'alias'));
      const result=preflight(join(base,'alias'));
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/symlinks|symlink/);
    } finally {rmSync(base,{recursive:true,force:true});}
  });

  it('refuses missing configuration rather than creating an insecure directory',()=>{
    const result=preflight('');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('IASSETSPRO_CAD_STORAGE_ROOT');
  });
});
