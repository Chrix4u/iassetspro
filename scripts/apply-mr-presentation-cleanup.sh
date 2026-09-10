#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/lightworld/webapps/iassetspro"
WORK="/home/lightworld/releases/iassetspro-mr-presentation-cleanup"
EXPECTED="fca33e9b5fba4a4d56e914f672b75ddeeeeb86f8"
FEATURE="fix/mr-presentation-cleanup"

printf '%s\n' '============================================================' ' iAssetsPro — CLIENT PRESENTATION MR FORM POLISH' '============================================================'

cd "$ROOT"
git fetch origin main "$FEATURE"
MAIN_SHA="$(git rev-parse origin/main)"
FEATURE_SHA="$(git rev-parse origin/$FEATURE)"
ORIGIN_URL="$(git remote get-url origin)"
echo "Expected base: $EXPECTED"
echo "origin/main:   $MAIN_SHA"
echo "feature base:  $FEATURE_SHA"
[[ "$MAIN_SHA" == "$EXPECTED" ]] || { echo "STOP: main moved; review before applying polish." >&2; exit 1; }
[[ "$FEATURE_SHA" == "$EXPECTED" ]] || { echo "STOP: feature branch is not at the expected base." >&2; exit 1; }

# Remove any partial worktree left by a previous helper run. Use a standalone
# clone for validation so the release does not depend on worktree metadata from
# the live repository/symlink.
if git worktree list --porcelain | grep -Fq "worktree $WORK"; then
  git worktree remove --force "$WORK" || true
  git worktree prune || true
fi
rm -rf "$WORK"
git clone --quiet --no-checkout "$ORIGIN_URL" "$WORK"
git -C "$WORK" checkout --detach "$EXPECTED"
git config --global --add safe.directory "$WORK" || true

# Build validation needs the production environment values, but .env remains
# ignored and is never staged or committed.
cp -a "$ROOT/.env" "$WORK/.env"
chown -R lightworld:lightworld "$WORK"

echo
echo '[1/4] Polish Create Maintenance Request for client presentation'
cd "$WORK"
python3 - <<'PY'
from pathlib import Path

form_path = Path('src/components/modules/MaintenancePages.tsx')
test_path = Path('src/components/modules/__tests__/create-maintenance-request-ux.test.ts')
form = form_path.read_text()
test = test_path.read_text()

def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'STOP: expected exactly one {label}, found {count}')
    return text.replace(old, new, 1)

form = replace_once(
    form,
    '    <form id="create-mr-form" onSubmit={handleSubmit} className="space-y-5">',
    '    <form id="create-mr-form" onSubmit={handleSubmit} className="space-y-4">',
    'form spacing marker',
)

old_registered = '''            className={`px-3 py-3 rounded-lg border-2 text-sm font-medium transition-all text-left ${assetMode === 'registered' ? 'border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-border bg-background text-muted-foreground hover:border-emerald-300'}`}
          >
            <Building2 className="h-4 w-4 inline mr-1.5" />Select Registered Asset
            <span className="block text-[11px] font-normal mt-0.5 opacity-75">Search the asset register by name, tag, serial, manufacturer, or model</span>
          </button>'''
new_registered = '''            className={`flex items-center justify-center gap-2 px-3 py-3 rounded-lg border-2 text-sm font-medium transition-all ${assetMode === 'registered' ? 'border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-border bg-background text-muted-foreground hover:border-emerald-300'}`}
          >
            <Building2 className="h-4 w-4" />
            <span>Registered Asset</span>
          </button>'''
form = replace_once(form, old_registered, new_registered, 'registered asset choice')

old_manual = '''            className={`px-3 py-3 rounded-lg border-2 text-sm font-medium transition-all text-left ${assetMode === 'manual' ? 'border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-border bg-background text-muted-foreground hover:border-emerald-300'}`}
          >
            <Pencil className="h-4 w-4 inline mr-1.5" />Enter Manually
            <span className="block text-[11px] font-normal mt-0.5 opacity-75">Use for an item or asset that is not yet registered</span>
          </button>'''
new_manual = '''            className={`flex items-center justify-center gap-2 px-3 py-3 rounded-lg border-2 text-sm font-medium transition-all ${assetMode === 'manual' ? 'border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-border bg-background text-muted-foreground hover:border-emerald-300'}`}
          >
            <Pencil className="h-4 w-4" />
            <span>Manual Entry</span>
          </button>'''
form = replace_once(form, old_manual, new_manual, 'manual asset choice')

for sentence in [
    '          <p className="text-[11px] text-muted-foreground">Selecting an asset can populate its registered location below.</p>\n',
    '          <p className="text-[11px] text-muted-foreground">This records the request against the name entered here without creating a new Asset Register record.</p>\n',
    '        <p className="text-[11px] text-muted-foreground">Location stays visible regardless of asset source or down status.</p>\n',
    '          <p className="text-[11px] text-muted-foreground">Down status affects operational urgency only; it never hides Location.</p>\n',
]:
    form = replace_once(form, sentence, '', sentence.strip())

form = replace_once(
    form,
    '''            placeholder={assetMode === 'registered' ? 'Asset location, building, floor, line, or area' : 'Location of the asset or item'}''',
    '''            placeholder="Building, floor, line or area"''',
    'location placeholder',
)

# Existing UX contract should reflect the polished labels.
test = replace_once(
    test,
    "    expect(form).toContain('Select Registered Asset');",
    "    expect(form).toContain('Registered Asset');\n    expect(form).toContain('Manual Entry');",
    'registered asset label assertion',
)

insert_before = "\n});\n"
new_test = '''\n  it('keeps the client-facing form concise and presentation-ready', () => {
    const verboseImplementationCopy = [
      'Search the asset register by name, tag, serial, manufacturer, or model',
      'Use for an item or asset that is not yet registered',
      'Selecting an asset can populate its registered location below.',
      'This records the request against the name entered here without creating a new Asset Register record.',
      'Location stays visible regardless of asset source or down status.',
      'Down status affects operational urgency only; it never hides Location.',
    ];
    for (const copy of verboseImplementationCopy) expect(form).not.toContain(copy);
    expect(form).toContain('placeholder="Building, floor, line or area"');
    expect(form).toContain('Submitting maintenance request...');
  });\n'''
idx = test.rfind(insert_before)
if idx < 0:
    raise SystemExit('STOP: could not find test-suite closing marker')
test = test[:idx] + new_test + test[idx:]

form_path.write_text(form)
test_path.write_text(test)
PY

git -C "$WORK" rev-parse --is-inside-work-tree
git -C "$WORK" diff --check
git -C "$WORK" diff --stat
git -C "$WORK" diff -- src/components/modules/MaintenancePages.tsx src/components/modules/__tests__/create-maintenance-request-ux.test.ts

echo
echo '[2/4] Validate focused UX/branding tests and Repairs TypeScript gate'
runuser -u lightworld -- env HOME=/home/lightworld bash -lc "
  set -euo pipefail
  cd '$WORK'
  bun install --frozen-lockfile
  bunx vitest run \\
    src/components/modules/__tests__/create-maintenance-request-ux.test.ts \\
    src/__tests__/branding/no-legacy-branding-word.test.ts
  bunx tsc -p tsconfig.repairs.json --noEmit
"

echo
echo '[3/4] Build production application'
runuser -u lightworld -- env HOME=/home/lightworld bash -lc "
  set -euo pipefail
  cd '$WORK'
  bun run build
"

echo
echo '[4/4] Commit and push isolated feature branch'
cd "$WORK"
git -C "$WORK" status --short
git -C "$WORK" add src/components/modules/MaintenancePages.tsx src/components/modules/__tests__/create-maintenance-request-ux.test.ts
git -C "$WORK" diff --cached --check

git -C "$WORK" -c user.name='CHRISTIAN AGBOTAH' \
    -c user.email='148919415+christianagbotah@users.noreply.github.com' \
    commit -m 'Polish maintenance request form for client presentation'

git -C "$WORK" push origin HEAD:"$FEATURE"

NEW_SHA="$(git -C "$WORK" rev-parse HEAD)"
echo '============================================================'
echo ' iAssetsPro MR PRESENTATION POLISH PUSHED'
echo '============================================================'
echo "$NEW_SHA"
echo "Feature: $FEATURE"
echo "Worktree: $WORK"
echo 'Production was not restarted or modified by this validation helper.'
