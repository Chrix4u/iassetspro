#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/lightworld/webapps/iassetspro"
WORK="/home/lightworld/releases/iassetspro-login-production-hardening"
EXPECTED="1fc128e8c769573b43f730c52d36e1e87e0bc4b8"
FEATURE="fix/login-production-hardening"

printf '%s\n' '============================================================' ' iAssetsPro — RESUME LOGIN PRODUCTION HARDENING' '============================================================'

[[ -d "$WORK/.git" ]] || { echo "STOP: isolated validation clone is missing: $WORK" >&2; exit 1; }
cd "$WORK"

ACTUAL="$(git rev-parse HEAD)"
echo "Expected base: $EXPECTED"
echo "Actual head:   $ACTUAL"
[[ "$ACTUAL" == "$EXPECTED" ]] || { echo "STOP: isolated clone moved; review before continuing." >&2; exit 1; }

# The first pass intentionally removed unsupported availability/certification
# claims, but one remaining feature-card sentence still said "24/7". Keep the
# useful monitoring feature without making an unsupported availability claim.
python3 - <<'PY'
from pathlib import Path
p = Path('src/components/LoginPage.tsx')
t = p.read_text()
old = "{ icon: BarChart3, label: 'Real-time Monitoring', desc: 'Track assets 24/7 with live dashboards', color: 'bg-emerald-500/20 text-emerald-300' },"
new = "{ icon: BarChart3, label: 'Real-time Monitoring', desc: 'Track assets with live dashboards', color: 'bg-emerald-500/20 text-emerald-300' },"
if old in t:
    p.write_text(t.replace(old, new, 1))
elif new not in t:
    raise SystemExit('STOP: monitoring copy is neither the expected old nor corrected text')
PY

echo
echo '[1/3] Verify intended hardening diff only'
# Expand untracked directories to individual files so the safety check sees the
# actual test file rather than only src/__tests__/presentation/.
STATUS="$(git status --porcelain=v1 --untracked-files=all)"
printf '%s\n' "$STATUS"

# Only LoginPage and the regression test may be changed by this hardening pass.
BAD="$(printf '%s\n' "$STATUS" | awk '{print $2}' | grep -Ev '^(src/components/LoginPage\.tsx|src/__tests__/presentation/login-production-safety\.test\.ts)$' || true)"
[[ -z "$BAD" ]] || { echo "STOP: unexpected modified files:" >&2; echo "$BAD" >&2; exit 1; }

[[ -f src/__tests__/presentation/login-production-safety.test.ts ]] || { echo 'STOP: regression test file is missing.' >&2; exit 1; }

git diff --check
git diff --stat

echo
echo '[2/3] Re-run focused tests, Repairs TypeScript gate, and production build'
runuser -u lightworld -- env HOME=/home/lightworld bash -lc "
  set -euo pipefail
  cd '$WORK'
  bunx prisma generate
  bunx vitest run \\
    src/__tests__/presentation/login-production-safety.test.ts \\
    src/__tests__/branding/no-legacy-branding-word.test.ts \\
    src/components/modules/__tests__/create-maintenance-request-ux.test.ts
  bunx tsc -p tsconfig.repairs.json --noEmit
  bun run build
"

echo
echo '[3/3] Commit and push hardening branch'
git add src/components/LoginPage.tsx src/__tests__/presentation/login-production-safety.test.ts
git diff --cached --check

git -c user.name='CHRISTIAN AGBOTAH' \
    -c user.email='148919415+christianagbotah@users.noreply.github.com' \
    commit -m 'Harden production login for client presentation'

git push origin HEAD:"$FEATURE"

NEW_SHA="$(git rev-parse HEAD)"
echo '============================================================'
echo ' iAssetsPro LOGIN PRODUCTION HARDENING PUSHED'
echo '============================================================'
echo "$NEW_SHA"
echo "Feature: $FEATURE"
echo "Clone:   $WORK"
echo 'Production was not restarted or modified by this resume helper.'
