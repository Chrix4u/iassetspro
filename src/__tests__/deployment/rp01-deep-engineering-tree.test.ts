import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = fs.readFileSync(
  'prisma/migrations/20260927180000_expand_rp01_engineering_tree/migration.sql',
  'utf8',
);

describe('RP-01 deep engineering hierarchy', () => {
  it('adds multiple industrial assemblies without replacing the canonical machine', () => {
    for (const code of ['RP01-ASM-WEB','RP01-ASM-DRIVE','RP01-ASM-INK','RP01-ASM-DRYER','RP01-ASM-CTRL','RP01-ASM-PNEU','RP01-ASM-SAFETY']) {
      expect(migration).toContain(code);
    }
    expect(migration).toContain('ON CONFLICT DO NOTHING');
  });

  it('drills from assemblies through maintainable subassemblies, components and parts', () => {
    for (const type of ["'assembly'","'subassembly'","'component'","'part'","'instrument'"]) {
      expect(migration).toContain(type);
    }
    expect(migration).toContain('RP01-CMP-MOTOR');
    expect(migration).toContain('RP01-PRT-MTRBRG-DE');
    expect(migration).toContain('RP01-CMP-EXFAN');
    expect(migration).toContain('RP01-PRT-EXFBRG');
  });

  it('keeps the hierarchy scoped to the canonical RP-01 staging asset', () => {
    expect(migration).toContain("current_database() <> 'lightworld_iassetspro_db'");
    expect(migration).toContain("'uat_asset_rotary_printer_01'");
    expect(migration).toContain('RP-01 deep hierarchy requires canonical UAT asset');
  });
});
