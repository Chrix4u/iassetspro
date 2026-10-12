import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  diagnosticsForTouchedFiles,
  evaluateCompilerRun,
  normalizeRepoPath,
  parseTypeScriptDiagnostics,
  summarizeDiagnosticModules,
} from './typescript-debt-ratchet';

const ZERO_SHA_RE = /^0+$/;
const TYPESCRIPT_FILE_RE = /\.tsx?$/i;

function git(args: string[]): string {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });

  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
    throw new Error(`git ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }

  return result.stdout.trim();
}

function commitExists(sha: string): boolean {
  if (!sha || ZERO_SHA_RE.test(sha)) return false;
  const result = spawnSync('git', ['cat-file', '-e', `${sha}^{commit}`], {
    encoding: 'utf8',
  });
  return result.status === 0;
}

function resolveHeadSha(): string {
  const requested = process.env.TYPECHECK_HEAD_SHA?.trim();
  if (requested && commitExists(requested)) return requested;
  return git(['rev-parse', 'HEAD']);
}

function resolveBaseSha(headSha: string): string {
  const requested = process.env.TYPECHECK_BASE_SHA?.trim() ?? '';
  if (commitExists(requested)) return requested;

  try {
    return git(['rev-parse', `${headSha}^`]);
  } catch {
    return git(['rev-list', '--max-parents=0', headSha]).split(/\r?\n/)[0];
  }
}

function touchedTypeScriptFiles(baseSha: string, headSha: string): string[] {
  const output = git([
    'diff',
    '--name-only',
    '--find-renames',
    '--diff-filter=ACMRT',
    baseSha,
    headSha,
    '--',
    '*.ts',
    '*.tsx',
  ]);

  if (!output) return [];
  return [...new Set(output.split(/\r?\n/).map(normalizeRepoPath).filter((file) => TYPESCRIPT_FILE_RE.test(file)))].sort();
}

function mergeNodeOptions(existing: string | undefined): string {
  const withoutHeap = (existing ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .filter((option) => !/^--max-old-space-size(?:=|$)/.test(option));
  return [...withoutHeap, '--max-old-space-size=4096'].join(' ');
}

function appendSummary(markdown: string): void {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  fs.appendFileSync(summaryPath, `${markdown}\n`, 'utf8');
}

function formatSummary(input: {
  baseSha: string;
  headSha: string;
  totalDiagnostics: number;
  touchedFiles: string[];
  touchedDiagnostics: ReturnType<typeof parseTypeScriptDiagnostics>;
  moduleSummary: Array<{ module: string; count: number }>;
  fatalReason: string | null;
}): string {
  const lines = [
    '## TypeScript debt ratchet',
    '',
    `- Base SHA: \`${input.baseSha}\``,
    `- Head SHA: \`${input.headSha}\``,
    `- Total full-repository diagnostics: **${input.totalDiagnostics}**`,
    `- Touched TypeScript files: **${input.touchedFiles.length}**`,
    `- Diagnostics in touched TypeScript files: **${input.touchedDiagnostics.length}**`,
  ];

  if (input.fatalReason) {
    lines.push(`- Compiler/infrastructure status: **FAIL** — ${input.fatalReason}`);
  } else {
    lines.push('- Compiler/infrastructure status: **OK**');
  }

  if (input.touchedFiles.length > 0) {
    lines.push('', '### Touched TypeScript files', '');
    for (const file of input.touchedFiles) lines.push(`- \`${file}\``);
  }

  if (input.moduleSummary.length > 0) {
    lines.push('', '### Diagnostic concentration', '', '| Module | Diagnostics |', '| --- | ---: |');
    for (const item of input.moduleSummary.slice(0, 20)) {
      lines.push(`| \`${item.module}\` | ${item.count} |`);
    }
  }

  if (input.touchedDiagnostics.length > 0) {
    lines.push('', '### Touched-file diagnostics', '');
    for (const diagnostic of input.touchedDiagnostics.slice(0, 50)) {
      lines.push(`- \`${diagnostic.file}:${diagnostic.line}:${diagnostic.column}\` ${diagnostic.code}`);
    }
  }

  return lines.join('\n');
}

function main(): void {
  const headSha = resolveHeadSha();
  const baseSha = resolveBaseSha(headSha);
  const touchedFiles = touchedTypeScriptFiles(baseSha, headSha);

  console.log(`[typescript-debt-ratchet] range ${baseSha}..${headSha}`);
  console.log(`[typescript-debt-ratchet] touched TypeScript files: ${touchedFiles.length}`);

  const compiler = spawnSync('bunx', ['tsc', '--noEmit', '--pretty', 'false'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      NODE_OPTIONS: mergeNodeOptions(process.env.NODE_OPTIONS),
    },
    maxBuffer: 128 * 1024 * 1024,
  });

  const output = [compiler.stdout, compiler.stderr].filter(Boolean).join('\n').trim();
  if (output) process.stdout.write(`${output}\n`);

  const diagnostics = parseTypeScriptDiagnostics(output);
  const evaluation = evaluateCompilerRun({
    exitCode: compiler.status,
    signal: compiler.signal,
    output,
    diagnostics,
  });
  const touchedDiagnostics = diagnosticsForTouchedFiles(diagnostics, touchedFiles);
  const moduleSummary = summarizeDiagnosticModules(diagnostics);

  appendSummary(formatSummary({
    baseSha,
    headSha,
    totalDiagnostics: diagnostics.length,
    touchedFiles,
    touchedDiagnostics,
    moduleSummary,
    fatalReason: evaluation.reason,
  }));

  console.log(`[typescript-debt-ratchet] total diagnostics: ${diagnostics.length}`);
  console.log(`[typescript-debt-ratchet] touched-file diagnostics: ${touchedDiagnostics.length}`);

  if (evaluation.fatal) {
    console.error(`[typescript-debt-ratchet] fatal: ${evaluation.reason}`);
    process.exit(1);
  }

  if (touchedDiagnostics.length > 0) {
    console.error('[typescript-debt-ratchet] touched TypeScript files introduced or retained compiler diagnostics:');
    for (const diagnostic of touchedDiagnostics) console.error(diagnostic.raw);
    process.exit(1);
  }

  console.log('[typescript-debt-ratchet] PASS: legacy diagnostics remain visible and no touched TypeScript file has a diagnostic.');
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[typescript-debt-ratchet] fatal infrastructure error: ${message}`);
  appendSummary(`## TypeScript debt ratchet\n\n- Compiler/infrastructure status: **FAIL** — ${message}`);
  process.exit(1);
}
