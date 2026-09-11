#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/lightworld/webapps/iassetspro"
WORK="/home/lightworld/releases/iassetspro-login-production-hardening"
EXPECTED="1fc128e8c769573b43f730c52d36e1e87e0bc4b8"
FEATURE="fix/login-production-hardening"

printf '%s\n' '============================================================' ' iAssetsPro — LOGIN PRODUCTION HARDENING' '============================================================'

cd "$ROOT"
git fetch origin main "$FEATURE"
MAIN_SHA="$(git rev-parse origin/main)"
FEATURE_SHA="$(git rev-parse origin/$FEATURE)"
ORIGIN_URL="$(git remote get-url origin)"
echo "Expected base: $EXPECTED"
echo "origin/main:   $MAIN_SHA"
echo "feature base:  $FEATURE_SHA"
[[ "$MAIN_SHA" == "$EXPECTED" ]] || { echo "STOP: main moved; review before applying hardening." >&2; exit 1; }
[[ "$FEATURE_SHA" == "$EXPECTED" ]] || { echo "STOP: feature branch is not at expected base." >&2; exit 1; }

rm -rf "$WORK"
git clone --quiet --no-checkout "$ORIGIN_URL" "$WORK"
git -C "$WORK" checkout --detach "$EXPECTED"
git config --global --add safe.directory "$WORK" || true
cp -a "$ROOT/.env" "$WORK/.env"
chown -R lightworld:lightworld "$WORK"

cd "$WORK"
echo
echo '[1/4] Remove public demo credentials and presentation-only claims from login'
python3 - <<'PY'
from pathlib import Path

p = Path('src/components/LoginPage.tsx')
t = p.read_text()

def once(old: str, new: str, label: str):
    global t
    c = t.count(old)
    if c != 1:
        raise SystemExit(f'STOP: expected exactly one {label}, found {c}')
    t = t.replace(old, new, 1)

once("import { Badge } from '@/components/ui/badge';\n", '', 'Badge import')
once('  ChevronDown,\n', '', 'ChevronDown import')
once("  const [showDemo, setShowDemo] = useState(false);\n", '', 'showDemo state')

stats = '''            {/* Stats */}\n            <div className="grid grid-cols-3 gap-3 pt-3">\n              {[\n                { value: '99.9%', label: 'System Uptime' },\n                { value: '24/7', label: 'Live Support' },\n                { value: 'ISO', label: '27001 Certified' },\n              ].map((s) => (\n                <div key={s.label} className="text-center">\n                  <div className="text-lg font-bold">{s.value}</div>\n                  <div className="text-[11px] text-emerald-300/60">{s.label}</div>\n                </div>\n              ))}\n            </div>\n'''
once(stats, '', 'unverified login stats')

footer_old = '''          <div className="flex items-center justify-between text-[11px] text-emerald-300/50 pt-6 border-t border-white/10">\n            <span>&copy; {new Date().getFullYear()} iAssetsPro</span>\n            <div className="flex items-center gap-2">\n              <span className="bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full text-[10px] font-semibold flex items-center gap-1">\n                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />\n                ONLINE\n              </span>\n              <span className="bg-white/[0.08] px-2 py-0.5 rounded">v2.0</span>\n            </div>\n          </div>'''
footer_new = '''          <div className="text-[11px] text-emerald-300/50 pt-6 border-t border-white/10">\n            <span>&copy; {new Date().getFullYear()} iAssetsPro</span>\n          </div>'''
once(footer_old, footer_new, 'static online/version footer')

once('                <span>Secured by enterprise-grade encryption</span>',
     '                <span>Secure role-based access</span>',
     'security badge copy')

start = t.index('          {/* Demo Accounts */}')
end = t.index('          {/* Help */}', start)
t = t[:start] + t[end:]

p.write_text(t)

test = Path('src/__tests__/presentation/login-production-safety.test.ts')
test.parent.mkdir(parents=True, exist_ok=True)
test.write_text("""import { describe, expect, it } from 'vitest';\nimport { readFileSync } from 'node:fs';\nimport { join } from 'node:path';\n\nconst login = readFileSync(join(process.cwd(), 'src/components/LoginPage.tsx'), 'utf8');\n\ndescribe('production login presentation safety', () => {\n  it('does not expose demo credentials or unsupported presentation claims', () => {\n    for (const forbidden of [\n      'Demo Accounts',\n      'admin123',\n      'password123',\n      '99.9%',\n      '24/7',\n      '27001 Certified',\n      'iAssetsPro-WO-Workflow-Presentation.pptx',\n      'showDemo',\n      'enterprise-grade encryption',\n    ]) {\n      expect(login).not.toContain(forbidden);\n    }\n  });\n\n  it('keeps a concise secure production login', () => {\n    expect(login).toContain('Welcome Back');\n    expect(login).toContain('Secure role-based access');\n    expect(login).toContain('Forgot password?');\n  });\n});\n""")
PY

git diff --check
git diff --stat
git diff -- src/components/LoginPage.tsx src/__tests__/presentation/login-production-safety.test.ts

echo
echo '[2/4] Install, generate Prisma, and validate focused presentation tests'
runuser -u lightworld -- env HOME=/home/lightworld bash -lc "
  set -euo pipefail
  cd '$WORK'
  bun install --frozen-lockfile
  bunx prisma generate
  bunx vitest run \\
    src/__tests__/presentation/login-production-safety.test.ts \\
    src/__tests__/branding/no-legacy-branding-word.test.ts \\
    src/components/modules/__tests__/create-maintenance-request-ux.test.ts
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
echo '[4/4] Commit and push hardening branch'
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
echo 'Production was not restarted or modified by this helper.'
