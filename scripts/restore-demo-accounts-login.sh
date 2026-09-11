#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/lightworld/webapps/iassetspro"
WORK="/home/lightworld/releases/iassetspro-restore-demo-accounts"
EXPECTED="11f8d257052bad2d45b81500b0d1457311767778"
FEATURE="fix/restore-demo-accounts-login"

printf '%s\n' '============================================================' ' iAssetsPro — RESTORE TEMPORARY DEMO ACCOUNTS' '============================================================'

cd "$ROOT"
git fetch origin main "$FEATURE"
MAIN_SHA="$(git rev-parse origin/main)"
FEATURE_SHA="$(git rev-parse origin/$FEATURE)"
ORIGIN_URL="$(git remote get-url origin)"
echo "Expected base: $EXPECTED"
echo "origin/main:   $MAIN_SHA"
echo "feature base:  $FEATURE_SHA"
[[ "$MAIN_SHA" == "$EXPECTED" ]] || { echo "STOP: main moved; review before restoring demo accounts." >&2; exit 1; }
[[ "$FEATURE_SHA" == "$EXPECTED" ]] || { echo "STOP: feature branch is not at expected base." >&2; exit 1; }

rm -rf "$WORK"
git clone --quiet --no-checkout "$ORIGIN_URL" "$WORK"
git -C "$WORK" checkout --detach "$EXPECTED"
git config --global --add safe.directory "$WORK" || true
cp -a "$ROOT/.env" "$WORK/.env"
chown -R lightworld:lightworld "$WORK"

cd "$WORK"
echo
echo '[1/4] Restore demo account selector only'
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

once("import { Label } from '@/components/ui/label';\n", "import { Label } from '@/components/ui/label';\nimport { Badge } from '@/components/ui/badge';\n", 'Label import anchor')
once("  Shield,\n} from 'lucide-react';", "  Shield,\n  ChevronDown,\n} from 'lucide-react';", 'lucide import anchor')
once("  const [forgotOpen, setForgotOpen] = useState(false);\n", "  const [forgotOpen, setForgotOpen] = useState(false);\n  const [showDemo, setShowDemo] = useState(false);\n", 'forgotOpen state anchor')

demo_block = '''          {/* Demo Accounts — temporary presentation/testing access */}\n          <div className="mt-4 sm:mt-5 rounded-xl sm:rounded-2xl bg-white/80 backdrop-blur border border-slate-200/60 shadow-sm overflow-hidden">\n            <button\n              type="button"\n              onClick={() => setShowDemo(!showDemo)}\n              className="w-full flex items-center justify-between px-4 py-3 sm:px-4 sm:py-3 text-left"\n            >\n              <p className="font-semibold text-[11px] sm:text-xs text-slate-500 uppercase tracking-wider">Demo Accounts</p>\n              <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${showDemo ? 'rotate-180' : ''}`} />\n            </button>\n            {showDemo && (\n              <div className="px-4 pb-3 space-y-1.5 text-xs max-h-[280px] overflow-y-auto">\n                <p className="text-[10px] text-slate-400 font-medium mb-1">Click to auto-fill credentials</p>\n                {[\n                  // ── Management ──\n                  { user: 'admin', pass: 'admin123', role: 'Administrator', desc: 'Full system access', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },\n                  { user: 'manager1', pass: 'password123', role: 'Plant Manager', desc: 'Plant-wide view', color: 'bg-violet-100 text-violet-700 border-violet-200' },\n                  // ── Maintenance ──\n                  { user: 'maint_mgr1', pass: 'password123', role: 'Maint. Manager', desc: 'Full RWOP + assets', color: 'bg-amber-100 text-amber-700 border-amber-200' },\n                  { user: 'planner1', pass: 'password123', role: 'Planner', desc: 'Plan & schedule WOs', color: 'bg-sky-100 text-sky-700 border-sky-200' },\n                  { user: 'supervisor1', pass: 'password123', role: 'Supervisor', desc: 'Supervise WO execution', color: 'bg-teal-100 text-teal-700 border-teal-200' },\n                  { user: 'tech1', pass: 'password123', role: 'Technician', desc: 'Execute WOs (Tema)', color: 'bg-orange-100 text-orange-700 border-orange-200' },\n                  { user: 'tech2', pass: 'password123', role: 'Technician', desc: 'Execute WOs (Kumasi)', color: 'bg-orange-100 text-orange-700 border-orange-200' },\n                  // ── Production ──\n                  { user: 'prod_mgr1', pass: 'password123', role: 'Prod. Manager', desc: 'Full production mgmt', color: 'bg-blue-100 text-blue-700 border-blue-200' },\n                  { user: 'operator1', pass: 'password123', role: 'Operator', desc: 'Data entry (Tema)', color: 'bg-slate-100 text-slate-600 border-slate-200' },\n                  { user: 'op2', pass: 'password123', role: 'Operator', desc: 'Data entry (Kumasi)', color: 'bg-slate-100 text-slate-600 border-slate-200' },\n                  // ── Store / Inventory ──\n                  { user: 'inv_mgr1', pass: 'password123', role: 'Inv. Manager', desc: 'Full inventory', color: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200' },\n                  { user: 'store1', pass: 'password123', role: 'Store Keeper', desc: 'Stock operations (Tema)', color: 'bg-rose-100 text-rose-700 border-rose-200' },\n                  { user: 'store2', pass: 'password123', role: 'Store Keeper', desc: 'Stock operations (Kumasi)', color: 'bg-rose-100 text-rose-700 border-rose-200' },\n                  { user: 'toolshop1', pass: 'password123', role: 'Tools Shop Att.', desc: 'Tool checkout & transfers', color: 'bg-pink-100 text-pink-700 border-pink-200' },\n                  // ── Quality / Safety / HR / IoT ──\n                  { user: 'qual_mgr1', pass: 'password123', role: 'Quality Mgr', desc: 'Quality & calibration', color: 'bg-cyan-100 text-cyan-700 border-cyan-200' },\n                  { user: 'safety1', pass: 'password123', role: 'Safety Officer', desc: 'HSE management', color: 'bg-red-100 text-red-700 border-red-200' },\n                  { user: 'hr1', pass: 'password123', role: 'HR Manager', desc: 'HR & training', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },\n                  { user: 'iot1', pass: 'password123', role: 'IoT Engineer', desc: 'IoT & predictive', color: 'bg-lime-100 text-lime-700 border-lime-200' },\n                  // ── Read-only ──\n                  { user: 'viewer1', pass: 'password123', role: 'Viewer', desc: 'Read-only access', color: 'bg-gray-100 text-gray-600 border-gray-200' },\n                ].map(d => (\n                  <button\n                    key={d.user}\n                    type="button"\n                    onClick={() => { setUsername(d.user); setPassword(d.pass); }}\n                    className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg bg-white hover:bg-emerald-50/50 border border-slate-100 hover:border-emerald-200 transition-all group cursor-pointer"\n                  >\n                    <div className="flex items-center gap-1.5 min-w-0">\n                      <span className="font-mono font-semibold text-slate-700 group-hover:text-emerald-700 transition-colors truncate">{d.user}</span>\n                      <span className="text-slate-300 shrink-0">/</span>\n                      <span className="font-mono text-slate-400">{d.pass}</span>\n                    </div>\n                    <div className="flex items-center gap-1.5 shrink-0 ml-2">\n                      <span className="hidden sm:inline text-[10px] text-slate-400 max-w-[80px] truncate">{d.desc}</span>\n                      <Badge variant="outline" className={`text-[9px] font-semibold px-1.5 py-0 ${d.color}`}>{d.role}</Badge>\n                    </div>\n                  </button>\n                ))}\n              </div>\n            )}\n          </div>\n\n'''

anchor = '          {/* Help */}\n'
count = t.count(anchor)
if count != 1:
    raise SystemExit(f'STOP: expected one Help anchor, found {count}')
t = t.replace(anchor, demo_block + anchor, 1)

p.write_text(t)

test = Path('src/__tests__/presentation/login-production-safety.test.ts')
test.write_text("""import { describe, expect, it } from 'vitest';\nimport { readFileSync } from 'node:fs';\nimport { join } from 'node:path';\n\nconst login = readFileSync(join(process.cwd(), 'src/components/LoginPage.tsx'), 'utf8');\n\ndescribe('production login presentation contract', () => {\n  it('keeps the temporary demo account selector available', () => {\n    expect(login).toContain('Demo Accounts');\n    expect(login).toContain('Click to auto-fill credentials');\n    expect(login).toContain("user: 'admin'");\n    expect(login).toContain("pass: 'admin123'");\n    expect(login).toContain("pass: 'password123'");\n    expect(login).toContain('showDemo');\n  });\n\n  it('does not restore unrelated unsupported presentation claims', () => {\n    for (const forbidden of [\n      '99.9%',\n      '24/7',\n      '27001 Certified',\n      'iAssetsPro-WO-Workflow-Presentation.pptx',\n      'enterprise-grade encryption',\n    ]) {\n      expect(login).not.toContain(forbidden);\n    }\n  });\n\n  it('keeps the normal secure login flow', () => {\n    expect(login).toContain('Welcome Back');\n    expect(login).toContain('Secure role-based access');\n    expect(login).toContain('Forgot password?');\n  });\n});\n""")
PY

git diff --check
git diff --stat
git diff -- src/components/LoginPage.tsx src/__tests__/presentation/login-production-safety.test.ts

echo
echo '[2/4] Install, generate Prisma, and validate focused tests'
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
echo '[4/4] Commit and push feature branch'
git add src/components/LoginPage.tsx src/__tests__/presentation/login-production-safety.test.ts
git diff --cached --check

git -c user.name='CHRISTIAN AGBOTAH' \
    -c user.email='148919415+christianagbotah@users.noreply.github.com' \
    commit -m 'Restore temporary demo accounts on login'

git push origin HEAD:"$FEATURE"

NEW_SHA="$(git rev-parse HEAD)"
echo '============================================================'
echo ' iAssetsPro DEMO ACCOUNTS RESTORED AND PUSHED'
echo '============================================================'
echo "$NEW_SHA"
echo "Feature: $FEATURE"
echo "Clone:   $WORK"
echo 'Production was not restarted or modified by this helper.'
