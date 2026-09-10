#!/usr/bin/env bash
set -euo pipefail

WORK="/home/lightworld/releases/iassetspro-create-mr-branding-fix"
EXPECTED="7e06e324cc003ed534e7ebfc592f3621ecb8a45c"
FEATURE="fix/create-maintenance-request-ux"

cd "$WORK"
git config --global --add safe.directory "$WORK" 2>/dev/null || true

ACTUAL="$(git rev-parse HEAD)"
echo "Expected head: $EXPECTED"
echo "Actual head:   $ACTUAL"
[[ "$ACTUAL" == "$EXPECTED" ]] || { echo "STOP: unexpected worktree head"; exit 1; }

cat > src/__tests__/branding/no-legacy-branding-word.test.ts <<'TEST'
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');

const visibleSurfaces = [
  'public/manifest.webmanifest',
  'src/app/layout.tsx',
  'src/components/LoginPage.tsx',
  'src/components/EAMApp.tsx',
  'src/components/shared/Sidebar.tsx',
  'src/components/modules/EnterpriseReports.tsx',
  'src/components/digital-twin/SystemDiagramPage.tsx',
  'src/app/api/reports/maintenance/export/route.ts',
  'src/lib/export-pdf.ts',
  'src/services/reportExportXlsx.service.ts',
];

const forbiddenVisiblePhrases = [
  'Enterprise Asset Management',
  'Enterprise Reports',
  'Enterprise Reporting',
  'Enterprise Report -',
  'Enterprise EAM',
  'Enterprise-grade process and instrumentation diagrams',
  'Enterprise maintenance performance and work-order detail',
];

describe('user-facing branding', () => {
  it('removes Enterprise from user-visible labels and presentation text while allowing technical identifiers/comments', () => {
    const violations: string[] = [];
    for (const file of visibleSurfaces) {
      const source = read(file);
      for (const phrase of forbiddenVisiblePhrases) {
        if (source.includes(phrase)) violations.push(`${file}: ${phrase}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('keeps technical report identifiers intact', () => {
    expect(read('src/components/modules/EnterpriseReports.tsx')).toContain('function EnterpriseReports');
    expect(read('src/components/EAMApp.tsx')).toContain("'enterprise-reports'");
    expect(read('src/app/api/reports/enterprise/route.ts')).toContain('/api/reports/enterprise');
  });
});
TEST

echo "[1/4] Validate focused regressions..."
runuser -u lightworld -- env HOME=/home/lightworld bash -lc "
set -euo pipefail
cd '$WORK'
bunx vitest run src/components/modules/__tests__/create-maintenance-request-ux.test.ts src/__tests__/branding/no-legacy-branding-word.test.ts
bunx tsc -p tsconfig.repairs.json --noEmit
"

echo "[2/4] Production build..."
runuser -u lightworld -- env HOME=/home/lightworld bash -lc "
set -euo pipefail
cd '$WORK'
bun run build
"

echo "[3/4] Review staged scope..."
git diff --check
git status --short
git diff --stat

echo "[4/4] Commit and push PR #38 corrections..."
git add src public
git diff --cached --check
git -c user.name='CHRISTIAN AGBOTAH' -c user.email='148919415+christianagbotah@users.noreply.github.com' commit -m 'Narrow Enterprise removal to user-facing views'
git push origin HEAD:"$FEATURE"

echo "============================================================"
echo " PR #38 VIEW-ONLY CORRECTIONS PUSHED"
echo "============================================================"
git log -2 --oneline
git rev-parse HEAD
