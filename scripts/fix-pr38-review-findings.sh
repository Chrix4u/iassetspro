#!/usr/bin/env bash
set -euo pipefail

WORK="/home/lightworld/releases/iassetspro-create-mr-branding-fix"
EXPECTED="7e06e324cc003ed534e7ebfc592f3621ecb8a45c"
FEATURE="fix/create-maintenance-request-ux"

echo "============================================================"
echo " iAssetsPro — PR #38 REVIEW CORRECTIONS"
echo "============================================================"

[[ -d "$WORK/.git" || -f "$WORK/.git" ]] || { echo "STOP: worktree missing: $WORK"; exit 1; }
cd "$WORK"

git config --global --add safe.directory "$WORK" 2>/dev/null || true
ACTUAL="$(git rev-parse HEAD)"
echo "Expected head: $EXPECTED"
echo "Actual head:   $ACTUAL"
[[ "$ACTUAL" == "$EXPECTED" ]] || { echo "STOP: feature head moved; review again."; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo "STOP: worktree is not clean."; git status --short; exit 1; }

echo
 echo "[1/5] Correct wording artifacts and strengthen registered-asset selection..."

python3 <<'PY'
from pathlib import Path

replacements = {
    'src/app/api/reports/enterprise/route.ts': [
        ('// -level maintenance report with all analytics sections', '// Maintenance report with all analytics sections'),
    ],
    'src/app/api/reports/maintenance/export/route.ts': [
        ("subtitle: 'maintenance performance and work-order detail'", "subtitle: 'Maintenance performance and work-order detail'"),
    ],
    'src/app/api/v1/status/route.ts': [
        ("platform: 'iAssetsPro ',", "platform: 'iAssetsPro',"),
    ],
    'src/components/digital-twin/DiagramTemplates.ts': [
        ('// -grade pre-built system diagram templates', '// Advanced pre-built system diagram templates'),
    ],
    'src/components/digital-twin/SystemDiagramPage.tsx': [
        ('// toolbar states', '// Toolbar states'),
        ('>-grade process and instrumentation diagrams<', '>Advanced process and instrumentation diagrams<'),
    ],
    'src/components/digital-twin/index.ts': [
        ('// integration panels', '// Integration panels'),
    ],
    'src/components/modules/MaintenancePages.tsx': [
        ('// time session — active session tracking across all WOs', '// Active time session — tracking across all work orders'),
        ('{/* Time Log Dialog — */}', '{/* Time Log Dialog */}'),
        ('{/* Time Logs — with Session Controls */}', '{/* Time Logs with Session Controls */}'),
    ],
    'src/components/modules/WOReportsPage.tsx': [
        ('{/* Materials Table — Grade with Part Details */}', '{/* Materials Table with Part Details */}'),
        ('{/* Failure Rate Detail Table — Grade with Asset Details */}', '{/* Failure Rate Detail Table with Asset Details */}'),
    ],
}

for rel, pairs in replacements.items():
    path = Path(rel)
    text = path.read_text(encoding='utf-8')
    for old, new in pairs:
        if old not in text:
            raise SystemExit(f'Expected text not found in {rel}: {old}')
        text = text.replace(old, new, 1)
    path.write_text(text, encoding='utf-8')

path = Path('src/components/modules/MaintenancePages.tsx')
text = path.read_text(encoding='utf-8')
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

    // After a selection the combobox clears its search query and refreshes.
    // Preserve the selected asset in the option set even when it is not in
    // the first 100 default results, otherwise the control would visually
    // fall back to its placeholder while still holding a valid assetId.
    if (!q && assetId && !assets.some((a: any) => a.id === assetId)) {
      const selected = await api.get(`/api/assets/${encodeURIComponent(assetId)}`);
      if (selected.success && selected.data) assets.unshift(selected.data);
    }

    assetMetaRef.current.clear();

    return assets.map((a: any) => {
"""
if old not in text:
    raise SystemExit('fetchAssetOptions block not found')
text = text.replace(old, new, 1)
text = text.replace('  }, []);\n\n  const handleRegisteredAssetChange', '  }, [assetId]);\n\n  const handleRegisteredAssetChange', 1)
path.write_text(text, encoding='utf-8')

print('✓ wording artifacts corrected')
print('✓ selected registered asset is preserved across query reset')
PY

echo
 echo "[2/5] Strengthen regression contract..."
python3 <<'PY'
from pathlib import Path
p = Path('src/components/modules/__tests__/create-maintenance-request-ux.test.ts')
text = p.read_text(encoding='utf-8')
needle = """  it('uses server-side asset search and validates both modes', () => {
    expect(form).toContain(\"params.set('search', q)\");
    expect(form).toContain(\"assetMode === 'registered' && !assetId\");
    expect(form).toContain(\"assetMode === 'manual' && !cleanManualAssetName\");
  });
"""
replacement = needle + """

  it('keeps the selected registered asset visible after the search query resets', () => {
    expect(form).toContain("!q && assetId && !assets.some");
    expect(form).toContain("/api/assets/${encodeURIComponent(assetId)}");
    expect(form).toContain('}, [assetId]);');
  });

  it('does not clear Location when either asset mode is toggled', () => {
    const registered = form.slice(form.indexOf('const switchToRegistered'), form.indexOf('const switchToManual'));
    const manual = form.slice(form.indexOf('const switchToManual'), form.indexOf('const handleSubmit'));
    expect(registered).not.toContain("setLocation('')");
    expect(manual).not.toContain("setLocation('')");
  });
"""
if needle not in text:
    raise SystemExit('test insertion point not found')
p.write_text(text.replace(needle, replacement, 1), encoding='utf-8')
PY

echo
 echo "[3/5] Verify branding and source quality..."
if git grep -n -w Enterprise -- src public; then
  echo "STOP: visible standalone Enterprise wording remains."
  exit 1
fi

if git grep -n -- '-grade process\|// -grade\|// -level\|iAssetsPro ' -- src public; then
  echo "STOP: malformed wording remains."
  exit 1
fi

git diff --check
git diff --stat

echo
 echo "[4/5] Re-run focused validation and production build..."
runuser -u lightworld -- env HOME=/home/lightworld bash -lc "
set -euo pipefail
cd '$WORK'
bunx vitest run src/components/modules/__tests__/create-maintenance-request-ux.test.ts src/__tests__/branding/no-legacy-branding-word.test.ts
bunx tsc -p tsconfig.repairs.json --noEmit
bun run build
"

echo
 echo "[5/5] Commit and push corrections..."
git add src public
git diff --cached --check
git -c user.name='CHRISTIAN AGBOTAH' -c user.email='148919415+christianagbotah@users.noreply.github.com' commit -m 'Address PR 38 UX and branding review findings'
git push origin HEAD:"$FEATURE"

echo "============================================================"
echo " PR #38 REVIEW CORRECTIONS PUSHED"
echo "============================================================"
git log -2 --oneline
git rev-parse HEAD
