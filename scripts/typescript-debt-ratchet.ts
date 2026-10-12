import path from 'node:path';

export type TypeScriptDiagnostic = {
  file: string | null;
  line: number | null;
  column: number | null;
  code: string;
  raw: string;
};

export type CompilerRunEvaluation = {
  fatal: boolean;
  reason: string | null;
};

const FILE_DIAGNOSTIC_RE = /^(.*)\((\d+),(\d+)\):\s+error\s+(TS\d+):/;
const GLOBAL_DIAGNOSTIC_RE = /^error\s+(TS\d+):/;
const OOM_RE = /(heap out of memory|reached heap limit|allocation failed)/i;

export function normalizeRepoPath(input: string): string {
  const slashPath = input.replace(/\\/g, '/').replace(/^\.\//, '');
  const normalized = path.posix.normalize(slashPath);
  return normalized === '.' ? '' : normalized.replace(/^\.\//, '');
}

export function parseTypeScriptDiagnostics(output: string): TypeScriptDiagnostic[] {
  const diagnostics: TypeScriptDiagnostic[] = [];

  for (const rawLine of output.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    const fileMatch = line.match(FILE_DIAGNOSTIC_RE);
    if (fileMatch) {
      diagnostics.push({
        file: normalizeRepoPath(fileMatch[1]),
        line: Number(fileMatch[2]),
        column: Number(fileMatch[3]),
        code: fileMatch[4],
        raw: rawLine,
      });
      continue;
    }

    const globalMatch = line.match(GLOBAL_DIAGNOSTIC_RE);
    if (globalMatch) {
      diagnostics.push({
        file: null,
        line: null,
        column: null,
        code: globalMatch[1],
        raw: rawLine,
      });
    }
  }

  return diagnostics;
}

export function diagnosticsForTouchedFiles(
  diagnostics: TypeScriptDiagnostic[],
  touchedFiles: string[],
): TypeScriptDiagnostic[] {
  const touched = new Set(touchedFiles.map(normalizeRepoPath));
  return diagnostics.filter((diagnostic) => diagnostic.file !== null && touched.has(normalizeRepoPath(diagnostic.file)));
}

export function evaluateCompilerRun(input: {
  exitCode: number | null;
  signal: string | null;
  output: string;
  diagnostics: TypeScriptDiagnostic[];
}): CompilerRunEvaluation {
  if (input.signal) {
    return { fatal: true, reason: `TypeScript compiler terminated by signal ${input.signal}` };
  }

  if (OOM_RE.test(input.output)) {
    return { fatal: true, reason: 'TypeScript compiler exhausted its memory budget' };
  }

  const globalDiagnostic = input.diagnostics.find((diagnostic) => diagnostic.file === null);
  if (globalDiagnostic) {
    return {
      fatal: true,
      reason: `TypeScript emitted an unattributable global diagnostic (${globalDiagnostic.code})`,
    };
  }

  if ((input.exitCode ?? 1) !== 0 && input.diagnostics.length === 0) {
    return {
      fatal: true,
      reason: `TypeScript exited with code ${input.exitCode ?? 'null'} without parseable diagnostics`,
    };
  }

  return { fatal: false, reason: null };
}

function diagnosticModule(file: string): string {
  const normalized = normalizeRepoPath(file);
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length <= 2) return normalized;
  return `${parts[0]}/${parts[1]}`;
}

export function summarizeDiagnosticModules(
  diagnostics: TypeScriptDiagnostic[],
): Array<{ module: string; count: number }> {
  const counts = new Map<string, number>();

  for (const diagnostic of diagnostics) {
    if (!diagnostic.file) continue;
    const module = diagnosticModule(diagnostic.file);
    counts.set(module, (counts.get(module) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([module, count]) => ({ module, count }))
    .sort((a, b) => b.count - a.count || a.module.localeCompare(b.module));
}
