import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  diagnosticsForTouchedFiles,
  evaluateCompilerRun,
  normalizeRepoPath,
  parseTypeScriptDiagnostics,
  summarizeDiagnosticModules,
} from '../../../scripts/typescript-debt-ratchet';

const diagnosticOutput = [
  "src/app/api/example/route.ts(12,5): error TS2322: Type 'string' is not assignable to type 'number'.",
  "src/components/LegacyPanel.tsx(8,3): error TS18048: 'item' is possibly 'undefined'.",
].join('\n');

describe('TypeScript debt ratchet policy', () => {
  it('parses file diagnostics and global diagnostics without losing the TS code', () => {
    const diagnostics = parseTypeScriptDiagnostics([
      diagnosticOutput,
      "error TS5083: Cannot read file 'tsconfig.missing.json'.",
    ].join('\n'));

    expect(diagnostics).toEqual([
      expect.objectContaining({
        file: 'src/app/api/example/route.ts',
        line: 12,
        column: 5,
        code: 'TS2322',
      }),
      expect.objectContaining({
        file: 'src/components/LegacyPanel.tsx',
        line: 8,
        column: 3,
        code: 'TS18048',
      }),
      expect.objectContaining({
        file: null,
        line: null,
        column: null,
        code: 'TS5083',
      }),
    ]);
  });

  it('normalizes repository paths for exact touched-file matching', () => {
    expect(normalizeRepoPath('./src\\app\\asset.ts')).toBe('src/app/asset.ts');
    expect(normalizeRepoPath('src/app/../app/asset.ts')).toBe('src/app/asset.ts');
  });

  it('fails only diagnostics that belong to touched TypeScript files', () => {
    const diagnostics = parseTypeScriptDiagnostics(diagnosticOutput);
    const touched = diagnosticsForTouchedFiles(diagnostics, [
      'src/components/LegacyPanel.tsx',
      'src/lib/unrelated.ts',
    ]);

    expect(touched).toHaveLength(1);
    expect(touched[0].file).toBe('src/components/LegacyPanel.tsx');
  });

  it('allows normal tsc diagnostic exit codes when every diagnostic is attributable to untouched legacy files', () => {
    const diagnostics = parseTypeScriptDiagnostics(diagnosticOutput);
    expect(evaluateCompilerRun({
      exitCode: 2,
      signal: null,
      output: diagnosticOutput,
      diagnostics,
    })).toEqual({ fatal: false, reason: null });
  });

  it('fails OOM, signals, unexplained non-zero exits, and global diagnostics', () => {
    expect(evaluateCompilerRun({
      exitCode: 134,
      signal: null,
      output: 'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory',
      diagnostics: [],
    }).fatal).toBe(true);

    expect(evaluateCompilerRun({
      exitCode: null,
      signal: 'SIGABRT',
      output: '',
      diagnostics: [],
    }).fatal).toBe(true);

    expect(evaluateCompilerRun({
      exitCode: 1,
      signal: null,
      output: 'unexpected compiler termination',
      diagnostics: [],
    }).fatal).toBe(true);

    const globalDiagnostics = parseTypeScriptDiagnostics(
      "error TS5083: Cannot read file 'tsconfig.missing.json'.",
    );
    expect(evaluateCompilerRun({
      exitCode: 2,
      signal: null,
      output: "error TS5083: Cannot read file 'tsconfig.missing.json'.",
      diagnostics: globalDiagnostics,
    }).fatal).toBe(true);
  });

  it('summarizes diagnostics by stable repository module buckets', () => {
    const diagnostics = parseTypeScriptDiagnostics([
      diagnosticOutput,
      'src/app/services/foo.ts(1,1): error TS2304: Cannot find name x.',
      'prisma/seed.ts(2,1): error TS2339: Property x does not exist.',
    ].join('\n'));

    expect(summarizeDiagnosticModules(diagnostics)).toEqual([
      { module: 'src/app', count: 2 },
      { module: 'prisma/seed.ts', count: 1 },
      { module: 'src/components', count: 1 },
    ]);
  });
});

describe('TypeScript debt ratchet CI contract', () => {
  it('uses a memory-safe ratchet instead of a non-blocking full-repository tsc step', () => {
    const workflow = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
    const typecheckJob = workflow.match(/  typecheck:[\s\S]*?\n  unit-tests:/)?.[0] || '';

    expect(typecheckJob).toContain('fetch-depth: 0');
    expect(typecheckJob).toContain('TYPECHECK_BASE_SHA');
    expect(typecheckJob).toContain('TYPECHECK_HEAD_SHA');
    expect(typecheckJob).toContain('bunx tsx scripts/check-typescript-debt-ratchet.ts');
    expect(typecheckJob).not.toContain('continue-on-error: true');
    expect(typecheckJob).toContain('bunx tsc -p tsconfig.repairs.json --noEmit');
  });

  it('runs full tsc with a 4 GB heap and writes a GitHub Actions summary', () => {
    expect(fs.existsSync('scripts/check-typescript-debt-ratchet.ts')).toBe(true);
    if (!fs.existsSync('scripts/check-typescript-debt-ratchet.ts')) return;

    const runner = fs.readFileSync('scripts/check-typescript-debt-ratchet.ts', 'utf8');
    expect(runner).toContain('--max-old-space-size=4096');
    expect(runner).toContain("'--noEmit', '--pretty', 'false'");
    expect(runner).toContain('GITHUB_STEP_SUMMARY');
  });
});
