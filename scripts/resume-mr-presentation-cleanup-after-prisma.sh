#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/lightworld/webapps/iassetspro"
WORK="/home/lightworld/releases/iassetspro-mr-presentation-cleanup"
EXPECTED="fca33e9b5fba4a4d56e914f672b75ddeeeeb86f8"
FEATURE="fix/mr-presentation-cleanup"

printf '%s\n' '============================================================' ' iAssetsPro — RESUME MR PRESENTATION POLISH' '============================================================'

[[ -d "$WORK/.git" ]] || { echo "STOP: isolated cleanup clone is missing: $WORK" >&2; exit 1; }
cd "$WORK"
ACTUAL="$(git rev-parse HEAD)"
echo "Expected base: $EXPECTED"
echo "Actual head:   $ACTUAL"
[[ "$ACTUAL" == "$EXPECTED" ]] || { echo "STOP: unexpected isolated clone HEAD." >&2; exit 1; }

# Only the two intended presentation-polish files may be modified.
CHANGED="$(git status --short | awk '{print $2}' | sort)"
EXPECTED_CHANGED="$(printf '%s\n' \
  'src/components/modules/MaintenancePages.tsx' \
  'src/components/modules/__tests__/create-maintenance-request-ux.test.ts' | sort)"
[[ "$CHANGED" == "$EXPECTED_CHANGED" ]] || {
  echo "STOP: isolated clone contains unexpected changes:" >&2
  git status --short >&2
  exit 1
}

grep -Fq '<span>Registered Asset</span>' src/components/modules/MaintenancePages.tsx || { echo 'STOP: Registered Asset polish is missing.' >&2; exit 1; }
grep -Fq '<span>Manual Entry</span>' src/components/modules/MaintenancePages.tsx || { echo 'STOP: Manual Entry polish is missing.' >&2; exit 1; }
for forbidden in \
  'Selecting an asset can populate its registered location below.' \
  'This records the request against the name entered here without creating a new Asset Register record.' \
  'Location stays visible regardless of asset source or down status.' \
  'Down status affects operational urgency only; it never hides Location.'; do
  if grep -Fq "$forbidden" src/components/modules/MaintenancePages.tsx; then
    echo "STOP: verbose presentation copy remains: $forbidden" >&2
    exit 1
  fi
done

git diff --check

echo
echo '[1/3] Generate Prisma client, then rerun focused tests and Repairs TypeScript gate'
runuser -u lightworld -- env HOME=/home/lightworld bash -lc "
  set -euo pipefail
  cd '$WORK'
  bunx prisma generate
  bunx vitest run \\
    src/components/modules/__tests__/create-maintenance-request-ux.test.ts \\
    src/__tests__/branding/no-legacy-branding-word.test.ts
  bunx tsc -p tsconfig.repairs.json --noEmit
"

echo
echo '[2/3] Build production application'
runuser -u lightworld -- env HOME=/home/lightworld bash -lc "
  set -euo pipefail
  cd '$WORK'
  bun run build
"

echo
echo '[3/3] Commit and push presentation-polish branch'
cd "$WORK"
git add src/components/modules/MaintenancePages.tsx src/components/modules/__tests__/create-maintenance-request-ux.test.ts
git diff --cached --check

git -c user.name='CHRISTIAN AGBOTAH' \
    -c user.email='148919415+christianagbotah@users.noreply.github.com' \
    commit -m 'Polish maintenance request form for client presentation'

git push origin HEAD:"$FEATURE"

NEW_SHA="$(git rev-parse HEAD)"
echo '============================================================'
echo ' iAssetsPro MR PRESENTATION POLISH PUSHED'
echo '============================================================'
echo "$NEW_SHA"
echo "Feature: $FEATURE"
echo "Clone:   $WORK"
echo 'Production was not restarted or modified by this resume helper.'
