import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ROOT = join(process.cwd(), 'src');
const LEGACY_SERVICE = 'workExecution.service';
const LEGACY_FILE = 'src/services/workExecution.service.ts';
const TEST_DIRECTORY = '__tests__';
const TEST_FILE_PATTERN = /\.(?:test|spec)\.(?:ts|tsx)$/;

const FORBIDDEN_EXPORTS = [
  'startWork',
  'pauseWork',
  'resumeWork',
  'enterWaitingState',
  'initiateHandover',
  'resumeAfterHandover',
  'submitCompletion',
  'supervisorVerify',
  'requestRework',
  'plannerClose',
  'cancelWorkOrder',
] as const;

async function collectSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      // This guard protects production callers. Unit/integration tests may
      // intentionally import the legacy compatibility service to verify its
      // behavior and must not be treated as production dependency violations.
      if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === TEST_DIRECTORY) continue;
      files.push(...await collectSourceFiles(fullPath));
      continue;
    }

    if (/\.(?:ts|tsx)$/.test(entry.name) && !TEST_FILE_PATTERN.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

function importedLegacyMutations(source: string): string[] {
  const found = new Set<string>();
  const importPattern = /import\s+([\s\S]*?)\s+from\s+['"]([^'"]*workExecution\.service)['"]/g;

  for (const match of source.matchAll(importPattern)) {
    const importClause = match[1] || '';
    for (const name of FORBIDDEN_EXPORTS) {
      if (new RegExp(`\\b${name}\\b`).test(importClause)) found.add(name);
    }
  }

  return [...found];
}

async function main() {
  const violations: Array<{ file: string; exports: string[] }> = [];

  for (const file of await collectSourceFiles(ROOT)) {
    const repoPath = relative(process.cwd(), file).replaceAll('\\', '/');
    if (repoPath === LEGACY_FILE) continue;

    const source = await readFile(file, 'utf8');
    if (!source.includes(LEGACY_SERVICE)) continue;

    const forbidden = importedLegacyMutations(source);
    if (forbidden.length > 0) {
      violations.push({ file: repoPath, exports: forbidden });
    }
  }

  if (violations.length > 0) {
    console.error('❌ Deprecated RWOP lifecycle mutation imports detected.');
    console.error('Production callers must use the canonical focused services instead:');
    for (const violation of violations) {
      console.error(`  - ${violation.file}: ${violation.exports.join(', ')}`);
    }
    process.exit(1);
  }

  console.log('✅ No production caller imports deprecated workExecution lifecycle mutations.');
}

main().catch((error: unknown) => {
  console.error('❌ Failed to inspect RWOP lifecycle imports:', error);
  process.exit(1);
});
