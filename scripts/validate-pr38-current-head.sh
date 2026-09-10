#!/usr/bin/env bash
set -euo pipefail

WORK="/home/lightworld/releases/iassetspro-create-mr-branding-fix"
EXPECTED="8038ac9415789fb01013312ebb8e1b4a636662fa"

echo "============================================================"
echo " iAssetsPro — VALIDATE PR #38 CURRENT HEAD"
echo "============================================================"

cd "$WORK"
git config --global --add safe.directory "$WORK" 2>/dev/null || true
ACTUAL="$(git rev-parse HEAD)"
echo "Expected head: $EXPECTED"
echo "Actual head:   $ACTUAL"
[[ "$ACTUAL" == "$EXPECTED" ]] || { echo "STOP: unexpected worktree head"; exit 1; }

if [[ -n "$(git status --porcelain)" ]]; then
  echo "STOP: worktree has uncommitted changes"
  git status --short
  exit 1
fi

echo
 echo "[1/3] Run focused MR UX and view-only branding tests..."
runuser -u lightworld -- env HOME=/home/lightworld bash -lc "
set -euo pipefail
cd '$WORK'
bunx vitest run src/components/modules/__tests__/create-maintenance-request-ux.test.ts src/__tests__/branding/no-legacy-branding-word.test.ts
"

echo
 echo "[2/3] Run Repairs TypeScript gate..."
runuser -u lightworld -- env HOME=/home/lightworld bash -lc "
set -euo pipefail
cd '$WORK'
bunx tsc -p tsconfig.repairs.json --noEmit
"

echo
 echo "[3/3] Run production build..."
runuser -u lightworld -- env HOME=/home/lightworld bash -lc "
set -euo pipefail
cd '$WORK'
bun run build
"

echo "============================================================"
echo " PR #38 CURRENT HEAD VALIDATED"
echo "============================================================"
git rev-parse HEAD
