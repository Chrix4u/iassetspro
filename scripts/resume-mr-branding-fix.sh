#!/usr/bin/env bash
set -euo pipefail

WORK="/home/lightworld/releases/iassetspro-create-mr-branding-fix"
BRANCH="fix/create-maintenance-request-ux"
LIVE="/home/lightworld/webapps/iassetspro"

echo "============================================================"
echo " iAssetsPro — RESUME MR UX + BRANDING FIX"
echo "============================================================"

[[ -d "$WORK/.git" || -f "$WORK/.git" ]] || {
  echo "STOP: isolated worktree not found at $WORK"
  exit 1
}

cd "$WORK"

echo
echo "[1/6] Verify pending MR/API changes exist..."

git status --short

grep -q "Select Registered Asset" src/components/modules/MaintenancePages.tsx || {
  echo "STOP: MR form replacement is missing."
  exit 1
}

grep -q "Select a registered asset or enter an asset/item name" src/app/api/maintenance-requests/route.ts || {
  echo "STOP: MR API hardening is missing."
  exit 1
}

echo
echo "[2/6] Remove the remaining branding word from PowerPoint assets..."

python3 <<'PY'
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
import os

needle = b'Enterprise'

for pptx in Path('public').glob('*.pptx'):
    with ZipFile(pptx, 'r') as zin:
        hits = []
        for info in zin.infolist():
            data = zin.read(info.filename)
            if needle in data:
                hits.append(info.filename)

        if not hits:
            continue

        tmp = pptx.with_suffix(pptx.suffix + '.tmp')
        replacements = 0

        with ZipFile(tmp, 'w', compression=ZIP_DEFLATED) as zout:
            for info in zin.infolist():
                data = zin.read(info.filename)
                if needle in data:
                    replacements += data.count(needle)
                    data = data.replace(needle + b' ', b'').replace(needle, b'')
                zout.writestr(info, data)

        os.replace(tmp, pptx)
        print(f'✓ {pptx}: removed {replacements} occurrence(s)')
PY

echo
echo "[3/6] Add regression tests and perform complete branding audit..."

mkdir -p src/components/modules/__tests__ src/__tests__/branding

cat > src/components/modules/__tests__/create-maintenance-request-ux.test.ts <<'TEST'
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(
  join(process.cwd(), 'src/components/modules/MaintenancePages.tsx'),
  'utf8',
);
const start = source.indexOf('export function CreateMRForm');
const end = source.indexOf('// MR DETAIL PAGE', start);
const form = source.slice(start, end);

describe('Create Maintenance Request UX contract', () => {
  it('renders Location exactly once and never ties it to machine-down state', () => {
    expect(form.match(/<Label>Location<\/Label>/g) || []).toHaveLength(1);
    expect(form).not.toContain("itemType === 'machine' && !machineDown");
    expect(form).not.toContain("assetMode === 'registered' && !machineDown");
  });

  it('provides direct registered and manual asset modes', () => {
    expect(form).toContain('Select Registered Asset');
    expect(form).toContain('Asset / Item Name *');
    expect(form).not.toContain('manualMode');
    expect(form).not.toContain('manualAssetId');
    expect(form).not.toContain('__create_new__');
  });

  it('uses server-side asset search and validates both modes', () => {
    expect(form).toContain("params.set('search', q)");
    expect(form).toContain("assetMode === 'registered' && !assetId");
    expect(form).toContain("assetMode === 'manual' && !cleanManualAssetName");
  });
});
TEST

cat > src/__tests__/branding/no-legacy-branding-word.test.ts <<'TEST'
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const extensions = new Set(['.ts','.tsx','.js','.jsx','.mjs','.cjs','.json','.webmanifest','.html','.css','.svg']);

function files(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...files(full));
    else if (extensions.has(extname(full).toLowerCase())) out.push(full);
  }
  return out;
}

describe('runtime branding', () => {
  it('contains no standalone legacy display word', () => {
    const oldWord = 'Enter' + 'prise';
    const pattern = new RegExp(`\\b${oldWord}\\b`);
    const violations = [...files(join(process.cwd(), 'src')), ...files(join(process.cwd(), 'public'))]
      .filter((file) => pattern.test(readFileSync(file, 'utf8')));
    expect(violations).toEqual([]);
  });
});
TEST

python3 <<'PY'
from pathlib import Path
from zipfile import ZipFile
import re

word = 'Enterprise'
pattern = re.compile(r'\bEnterprise\b')
text_ext = {'.ts','.tsx','.js','.jsx','.mjs','.cjs','.json','.webmanifest','.html','.css','.svg'}
violations = []

for root in (Path('src'), Path('public')):
    for p in root.rglob('*'):
        if not p.is_file() or p.suffix.lower() not in text_ext:
            continue
        try:
            text = p.read_text(encoding='utf-8')
        except UnicodeDecodeError:
            continue
        if pattern.search(text):
            violations.append(str(p))

for pptx in Path('public').glob('*.pptx'):
    with ZipFile(pptx, 'r') as z:
        for name in z.namelist():
            data = z.read(name)
            if word.encode() in data:
                violations.append(f'{pptx}!{name}')

if violations:
    print('STOP: branding word remains in:')
    for v in violations:
        print('  ' + v)
    raise SystemExit(1)

print('✅ No standalone branding word remains in runtime text or PowerPoint contents.')
PY

# Remove the temporary implementation helper from the final PR diff.
git rm -f scripts/apply-mr-branding-fix.sh >/dev/null 2>&1 || true

git diff --check

echo
echo "[4/6] Validate MR UX, API, TypeScript and production build..."

runuser -u lightworld -- env HOME=/home/lightworld bash -lc "
set -euo pipefail
cd '$WORK'
bun install --frozen-lockfile
bunx prisma generate
bunx vitest run \
  src/components/modules/__tests__/create-maintenance-request-ux.test.ts \
  src/__tests__/branding/no-legacy-branding-word.test.ts
bunx tsc -p tsconfig.repairs.json --noEmit
bun run build
"

echo
echo "[5/6] Commit and push completed implementation..."

git add -A
git diff --cached --check

echo "Changed files:"
git diff --cached --name-only

echo
echo "Diff summary:"
git diff --cached --stat

git -c user.name="CHRISTIAN AGBOTAH" \
    -c user.email="148919415+christianagbotah@users.noreply.github.com" \
    commit -m "Fix maintenance request asset UX and remove legacy branding"

git push origin HEAD:"$BRANCH"

echo
echo "[6/6] Verify live production was untouched..."
curl -fsS --max-time 15 http://127.0.0.1:3001/api/health
echo

echo "============================================================"
echo " FIXES PUSHED AND READY FOR REVIEW"
echo "============================================================"
git log -1 --oneline
git rev-parse HEAD
