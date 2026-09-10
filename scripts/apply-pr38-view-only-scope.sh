#!/usr/bin/env bash
set -euo pipefail

WORK="/home/lightworld/releases/iassetspro-create-mr-branding-fix"
FEATURE="fix/create-maintenance-request-ux"
EXPECTED="7e06e324cc003ed534e7ebfc592f3621ecb8a45c"
BASE="e4c1b191128f6522b17475c30e0abece4a6aacbd"

echo "============================================================"
echo " iAssetsPro — PR #38 VIEW-ONLY BRANDING SCOPE"
echo "============================================================"

cd "$WORK"
git config --global --add safe.directory "$WORK" 2>/dev/null || true

ACTUAL="$(git rev-parse HEAD)"
echo "Expected PR head: $EXPECTED"
echo "Actual worktree:  $ACTUAL"
[[ "$ACTUAL" == "$EXPECTED" ]] || { echo "STOP: worktree head moved."; exit 1; }

# Discard only uncommitted review-attempt changes in this isolated worktree.
git reset --hard "$EXPECTED"
git clean -fd

echo
 echo "[1/5] Restore technical/internal occurrences and keep display text changes only..."

# These files only had internal prompt/comment/API metadata branding edits in PR #38.
# Restore them exactly from main so technical text is not renamed.
git checkout "$BASE" -- \
  src/app/api/assets/ai-generate/route.ts \
  src/app/api/reports/enterprise/route.ts \
  src/app/api/v1/digital-twins/route.ts \
  src/app/api/v1/status/route.ts \
  src/components/digital-twin/DiagramTemplates.ts \
  src/components/digital-twin/index.ts \
  src/components/modules/WOReportsPage.tsx

python3 <<'PY'
from pathlib import Path

# Mixed file: restore internal comments, keep the visible page wording clean.
p = Path('src/components/digital-twin/SystemDiagramPage.tsx')
s = p.read_text(encoding='utf-8')
s = s.replace('// toolbar states', '// Enterprise toolbar states', 1)
s = s.replace('>-grade process and instrumentation diagrams<', '>Advanced process and instrumentation diagrams<', 1)
p.write_text(s, encoding='utf-8')

# Mixed file: keep functional MR UX changes, restore internal-only comments.
p = Path('src/components/modules/MaintenancePages.tsx')
s = p.read_text(encoding='utf-8')
s = s.replace('// time session — active session tracking across all WOs', '// Enterprise time session — active session tracking across all WOs', 1)
s = s.replace('{/* Time Log Dialog — */}', '{/* Time Log Dialog — Enterprise */}', 1)
s = s.replace('{/* Time Logs — with Session Controls */}', '{/* Time Logs — Enterprise with Session Controls */}', 1)

old = """  const fetchAssetOptions = useCallback(async (query: string) => {
    const params = new URLSearchParams({ limit: '100' });
    const q = query.trim();
    if (q) params.set('search', q);

    const res = await api.get(`/api/assets?${params.toString()}`);
    if (!res.success || !res.data) return [];

    const assets = Array.isArray(res.data) ? res.data : [];
    assetMetaRef.current.clear();

    return assets.map((a: any) => {
"""
new = """  const fetchAssetOptions = useCallback(async (query: string) => {
    const params = new URLSearchParams({ limit: '100' });
    const q = query.trim();
    if (q) params.set('search', q);

    const res = await api.get(`/api/assets?${params.toString()}`);
    if (!res.success || !res.data) return [];

    let assets = Array.isArray(res.data) ? [...res.data] : [];

    // AsyncSearchableSelect clears its search query after selection. Keep the
    // selected asset in the option set even when it is outside the first page.
    if (!q && assetId && !assets.some((a: any) => a.id === assetId)) {
      const selected = await api.get(`/api/assets/${encodeURIComponent(assetId)}`);
      if (selected.success && selected.data) assets.unshift(selected.data);
    }

    assetMetaRef.current.clear();

    return assets.map((a: any) => {
"""
if old not in s:
    raise SystemExit('Expected fetchAssetOptions block not found')
s = s.replace(old, new, 1)
s = s.replace('  }, []);\n\n  const handleRegisteredAssetChange', '  }, [assetId]);\n\n  const handleRegisteredAssetChange', 1)
p.write_text(s, encoding='utf-8')

# User-visible generated report wording should remain clean and grammatical.
p = Path('src/app/api/reports/maintenance/export/route.ts')
s = p.read_text(encoding='utf-8').replace(
    "subtitle: 'maintenance performance and work-order detail'",
    "subtitle: 'Maintenance performance and work-order detail'",
    1,
)
p.write_text(s, encoding='utf-8')
PY

# Preserve original file modes for bundled presentations; only their visible text changed.
chmod 755 public/WO-Workflow-Presentation.pptx public/iAssetsPro-WO-Workflow-Presentation.pptx

echo
 echo "[2/5] Narrow branding regression to user-facing surfaces only..."
cat > src/__tests__/branding/no-legacy-branding-word.test.ts <<'TEST'
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const visibleTextFiles = [
  'public/manifest.webmanifest',
  'src/app/layout.tsx',
  'src/components/LoginPage.tsx',
  'src/components/EAMApp.tsx',
  'src/components/shared/Sidebar.tsx',
  'src/components/digital-twin/SystemDiagramPage.tsx',
  'src/components/modules/EnterpriseReports.tsx',
  'src/lib/export-pdf.ts',
  'src/services/reportExportXlsx.service.ts',
];

describe('user-facing branding', () => {
  it('does not show the legacy standalone branding word in view text surfaces', () => {
    const oldWord = 'Enter' + 'prise';
    const pattern = new RegExp(`\\b${oldWord}\\b`);
    const violations = visibleTextFiles.filter((file) =>
      pattern.test(readFileSync(join(process.cwd(), file), 'utf8')),
    );
    expect(violations).toEqual([]);
  });
});
TEST

python3 <<'PY'
from pathlib import Path
p = Path('src/components/modules/__tests__/create-maintenance-request-ux.test.ts')
s = p.read_text(encoding='utf-8')
needle = """  it('uses server-side asset search and validates both modes', () => {
    expect(form).toContain(\"params.set('search', q)\");
    expect(form).toContain(\"assetMode === 'registered' && !assetId\");
    expect(form).toContain(\"assetMode === 'manual' && !cleanManualAssetName\");
  });
"""
extra = needle + """

  it('keeps a selected registered asset available after search reset', () => {
    expect(form).toContain('!q && assetId && !assets.some');
    expect(form).toContain('/api/assets/${encodeURIComponent(assetId)}');
    expect(form).toContain('}, [assetId]);');
  });

  it('does not clear Location when switching registered/manual modes', () => {
    const registered = form.slice(form.indexOf('const switchToRegistered'), form.indexOf('const switchToManual'));
    const manual = form.slice(form.indexOf('const switchToManual'), form.indexOf('const handleSubmit'));
    expect(registered).not.toContain(\"setLocation('')\");
    expect(manual).not.toContain(\"setLocation('')\");
  });
"""
if needle not in s:
    raise SystemExit('MR test insertion point not found')
p.write_text(s.replace(needle, extra, 1), encoding='utf-8')
PY

echo
 echo "[3/5] Verify technical identifiers remain unchanged..."
# These are intentionally preserved technical names/routes/filenames.
grep -q "EnterpriseReports" src/components/modules/EnterpriseReports.tsx
grep -q "enterprise-reports" src/components/EAMApp.tsx
grep -q "/api/reports/enterprise" src/components/modules/EnterpriseReports.tsx
grep -q "enterprise-report-" src/components/modules/EnterpriseReports.tsx

git diff --check
git diff --stat

echo
 echo "[4/5] Run focused tests, Repairs TypeScript gate, and production build..."
runuser -u lightworld -- env HOME=/home/lightworld bash -lc "
set -euo pipefail
cd '$WORK'
bunx vitest run src/components/modules/__tests__/create-maintenance-request-ux.test.ts src/__tests__/branding/no-legacy-branding-word.test.ts
bunx tsc -p tsconfig.repairs.json --noEmit
bun run build
"

echo
 echo "[5/5] Commit and push corrected PR scope..."
git add src public
git diff --cached --check

git -c user.name='CHRISTIAN AGBOTAH' \
    -c user.email='148919415+christianagbotah@users.noreply.github.com' \
    commit -m 'Limit Enterprise branding removal to user-facing text'

git push origin HEAD:"$FEATURE"

echo "============================================================"
echo " PR #38 VIEW-ONLY SCOPE CORRECTION PUSHED"
echo "============================================================"
git log -2 --oneline
git rev-parse HEAD
