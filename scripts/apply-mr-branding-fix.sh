#!/usr/bin/env bash
set -euo pipefail

LIVE="/home/lightworld/webapps/iassetspro"
BASE_SHA="e4c1b191128f6522b17475c30e0abece4a6aacbd"
BRANCH="fix/create-maintenance-request-ux"
WORK="/home/lightworld/releases/iassetspro-create-mr-branding-fix"
HELPER_REL="scripts/apply-mr-branding-fix.sh"

echo "============================================================"
echo " iAssetsPro — APPLY MR UX + BRANDING FIXES"
echo "============================================================"

echo
echo "[1/8] Verify production and prepare isolated worktree..."
curl -fsS --max-time 15 http://127.0.0.1:3001/api/health
echo

git config --global --add safe.directory "$(readlink -f "$LIVE")" 2>/dev/null || true
git -C "$LIVE" remote set-url origin git@github.com:christianagbotah/eam-system.git
git -C "$LIVE" fetch --no-tags origin main "$BRANCH"

REMOTE_MAIN="$(git -C "$LIVE" rev-parse origin/main)"
echo "Expected main: $BASE_SHA"
echo "GitHub main:   $REMOTE_MAIN"
[[ "$REMOTE_MAIN" == "$BASE_SHA" ]] || { echo "STOP: main moved; re-review required."; exit 1; }

if [[ -e "$WORK" ]]; then
  echo "Removing stale isolated worktree..."
  git -C "$LIVE" worktree remove --force "$WORK" 2>/dev/null || rm -rf "$WORK"
fi

git -C "$LIVE" worktree add -B "$BRANCH" "$WORK" "origin/$BRANCH"
git config --global --add safe.directory "$WORK" 2>/dev/null || true
cp -a "$LIVE/.env" "$WORK/.env"
chown -R lightworld:lightworld "$WORK"
cd "$WORK"

echo
echo "[2/8] Replace Create Maintenance Request form..."
python3 <<'PY'
from pathlib import Path

path = Path('src/components/modules/MaintenancePages.tsx')
text = path.read_text(encoding='utf-8')
start_marker = "export function CreateMRForm({ onSuccess }: { onSuccess: () => void }) {"
end_marker = "// ============================================================================\n// MR DETAIL PAGE"
start = text.find(start_marker)
end = text.find(end_marker, start)
if start < 0 or end < 0:
    raise SystemExit('CreateMRForm boundaries not found')

replacement = r'''export function CreateMRForm({ onSuccess }: { onSuccess: () => void }) {
  const { user, isAdmin } = useAuthStore();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [assetMode, setAssetMode] = useState<'registered' | 'manual'>('registered');
  const [assetId, setAssetId] = useState('');
  const [manualAssetName, setManualAssetName] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [departmentLabel, setDepartmentLabel] = useState('');
  const [category, setCategory] = useState('');
  const [machineDown, setMachineDown] = useState(false);
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);

  const assetMetaRef = useRef(new Map<string, { location: string }>());
  const lastAutoLocationRef = useRef('');

  const fetchAssetOptions = useCallback(async (query: string) => {
    const params = new URLSearchParams({ limit: '100' });
    const q = query.trim();
    if (q) params.set('search', q);

    const res = await api.get(`/api/assets?${params.toString()}`);
    if (!res.success || !res.data) return [];

    const assets = Array.isArray(res.data) ? res.data : [];
    assetMetaRef.current.clear();

    return assets.map((a: any) => {
      assetMetaRef.current.set(a.id, { location: (a.location || '').trim() });
      const tag = a.assetTag ? ` [${a.assetTag}]` : '';
      const serial = a.serialNumber ? ` — ${a.serialNumber}` : '';
      return {
        value: a.id,
        label: `${a.name || 'Unnamed Asset'}${tag}${serial}`,
        badge: a.status,
      };
    });
  }, []);

  const handleRegisteredAssetChange = useCallback((value: string) => {
    setAssetId(value);
    if (!value) return;

    const suggestedLocation = assetMetaRef.current.get(value)?.location || '';
    setLocation((current) => {
      const currentTrimmed = current.trim();
      if (!currentTrimmed || currentTrimmed === lastAutoLocationRef.current) {
        return suggestedLocation;
      }
      return current;
    });
    lastAutoLocationRef.current = suggestedLocation;
  }, []);

  useEffect(() => {
    if (!user?.department) return;
    setDepartmentLabel(user.department);
    api.get('/api/departments?limit=100').then((res) => {
      if (!res.success || !Array.isArray(res.data)) return;
      const dept = res.data.find((d: any) =>
        d.id === user.department || d.code === user.department || d.name === user.department
      );
      if (dept) setDepartmentId(dept.id);
    });
  }, [user?.department]);

  const isDepartmentLocked = !isAdmin() && !!user?.department;

  const switchToRegistered = () => {
    setAssetMode('registered');
    setManualAssetName('');
  };

  const switchToManual = () => {
    setAssetMode('manual');
    setAssetId('');
    lastAutoLocationRef.current = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanTitle = title.trim();
    const cleanManualAssetName = manualAssetName.trim();

    if (!cleanTitle) {
      toast.error('Please enter a request title');
      return;
    }
    if (assetMode === 'registered' && !assetId) {
      toast.error('Please select a registered asset');
      return;
    }
    if (assetMode === 'manual' && !cleanManualAssetName) {
      toast.error('Please enter the asset or item name');
      return;
    }

    setLoading(true);
    try {
      const payload: any = {
        title: cleanTitle,
        description: description.trim(),
        priority,
        departmentId,
        category,
        machineDownStatus: machineDown,
        location: location.trim(),
      };
      if (assetMode === 'registered') payload.assetId = assetId;
      else payload.assetName = cleanManualAssetName;

      const res = await api.post('/api/maintenance-requests', payload);
      if (res.success) {
        toast.success('Maintenance request created');
        onSuccess();
      } else {
        toast.error(res.error || 'Failed to create request');
      }
    } catch (error: any) {
      toast.error(error?.message || 'Failed to create request');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form id="create-mr-form" onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label>Title *</Label>
        <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Brief description of the issue" required />
      </div>

      <div className="space-y-2">
        <Label>Description</Label>
        <Textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the fault, symptoms, observations, and any immediate action taken" rows={3} />
      </div>

      <div className="space-y-2">
        <Label>Asset Source *</Label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button
            type="button"
            onClick={switchToRegistered}
            aria-pressed={assetMode === 'registered'}
            className={`px-3 py-3 rounded-lg border-2 text-sm font-medium transition-all text-left ${assetMode === 'registered' ? 'border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-border bg-background text-muted-foreground hover:border-emerald-300'}`}
          >
            <Building2 className="h-4 w-4 inline mr-1.5" />Select Registered Asset
            <span className="block text-[11px] font-normal mt-0.5 opacity-75">Search the asset register by name, tag, serial, manufacturer, or model</span>
          </button>
          <button
            type="button"
            onClick={switchToManual}
            aria-pressed={assetMode === 'manual'}
            className={`px-3 py-3 rounded-lg border-2 text-sm font-medium transition-all text-left ${assetMode === 'manual' ? 'border-emerald-600 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-border bg-background text-muted-foreground hover:border-emerald-300'}`}
          >
            <Pencil className="h-4 w-4 inline mr-1.5" />Enter Manually
            <span className="block text-[11px] font-normal mt-0.5 opacity-75">Use for an item or asset that is not yet registered</span>
          </button>
        </div>
      </div>

      {assetMode === 'registered' ? (
        <div className="space-y-2">
          <Label>Registered Asset *</Label>
          <AsyncSearchableSelect
            value={assetId}
            onValueChange={handleRegisteredAssetChange}
            fetchOptions={fetchAssetOptions}
            placeholder="Select registered asset..."
            searchPlaceholder="Search by name, tag, serial, manufacturer, or model..."
            emptyMessage="No registered assets found."
          />
          <p className="text-[11px] text-muted-foreground">Selecting an asset can populate its registered location below.</p>
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Asset / Item Name *</Label>
          <Input
            value={manualAssetName}
            onChange={e => setManualAssetName(e.target.value)}
            placeholder="Enter asset, machine, component, facility, or item name"
            required
          />
          <p className="text-[11px] text-muted-foreground">This records the request against the name entered here without creating a new Asset Register record.</p>
        </div>
      )}

      <div className="space-y-2">
        <Label>Location</Label>
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder={assetMode === 'registered' ? 'Asset location, building, floor, line, or area' : 'Location of the asset or item'}
            className="pl-9"
          />
        </div>
        <p className="text-[11px] text-muted-foreground">Location stays visible regardless of asset source or down status.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Department {isDepartmentLocked && <span className="text-xs text-muted-foreground font-normal ml-1">(auto-filled)</span>}</Label>
          {isDepartmentLocked ? (
            <div className="flex h-10 w-full items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">{departmentLabel || departmentId}</div>
          ) : (
            <AsyncSearchableSelect
              value={departmentId}
              onValueChange={setDepartmentId}
              fetchOptions={async (query) => {
                const params = new URLSearchParams({ limit: '100' });
                if (query.trim()) params.set('search', query.trim());
                const res = await api.get(`/api/departments?${params.toString()}`);
                if (!res.success || !res.data) return [];
                return (Array.isArray(res.data) ? res.data : []).map((d: any) => ({
                  value: d.id,
                  label: d.code ? `${d.name} (${d.code})` : d.name,
                }));
              }}
              placeholder="Select department..."
              searchPlaceholder="Search departments..."
            />
          )}
        </div>
        <div className="space-y-2">
          <Label>Category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue placeholder="Select category..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mechanical">Mechanical</SelectItem>
              <SelectItem value="electrical">Electrical</SelectItem>
              <SelectItem value="hydraulic">Hydraulic</SelectItem>
              <SelectItem value="pneumatic">Pneumatic</SelectItem>
              <SelectItem value="instrumentation">Instrumentation</SelectItem>
              <SelectItem value="structural">Structural</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Priority</Label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="low">Low</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="urgent">Urgent</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Machine / Equipment Down?</Label>
          <Select value={machineDown ? 'yes' : 'no'} onValueChange={v => setMachineDown(v === 'yes')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="no">No — Operating / Available</SelectItem>
              <SelectItem value="yes">Yes — Down / Unavailable</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">Down status affects operational urgency only; it never hides Location.</p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />Submitting maintenance request...
        </div>
      )}
    </form>
  );
}

'''

path.write_text(text[:start] + replacement + text[end:], encoding='utf-8')
print('✓ CreateMRForm replaced')
PY

echo
echo "[3/8] Harden Maintenance Request API..."
python3 <<'PY'
from pathlib import Path

path = Path('src/app/api/maintenance-requests/route.ts')
text = path.read_text(encoding='utf-8')

old = """    if (!title) {\n      return NextResponse.json({ success: false, error: 'Title is required' }, { status: 400 });\n    }\n\n    let resolvedPlantId: string | null = plantId || null;\n"""
new = """    if (!title || !String(title).trim()) {\n      return NextResponse.json({ success: false, error: 'Title is required' }, { status: 400 });\n    }\n\n    const normalizedAssetName = typeof assetName === 'string' ? assetName.trim() : '';\n    if (!assetId && !normalizedAssetName) {\n      return NextResponse.json(\n        { success: false, error: 'Select a registered asset or enter an asset/item name' },\n        { status: 400 },\n      );\n    }\n\n    let resolvedPlantId: string | null = plantId || null;\n"""
if old not in text:
    raise SystemExit('title validation block not found')
text = text.replace(old, new, 1)

old = """    if (assetId) {\n      const asset = await db.asset.findUnique({\n        where: { id: assetId },\n        select: { id: true, plantId: true, name: true },\n      });\n      if (!asset) {\n        return NextResponse.json({ success: false, error: 'Asset not found' }, { status: 404 });\n      }\n      if (asset.plantId !== resolvedPlantId) {\n        return NextResponse.json(\n          { success: false, error: 'Asset does not belong to the selected plant' },\n          { status: 400 },\n        );\n      }\n    }\n\n    let resolvedDepartmentId: string | null = departmentId || null;\n"""
new = """    let resolvedAssetName: string | null = normalizedAssetName || null;\n\n    if (assetId) {\n      const asset = await db.asset.findUnique({\n        where: { id: assetId },\n        select: { id: true, plantId: true, name: true },\n      });\n      if (!asset) {\n        return NextResponse.json({ success: false, error: 'Asset not found' }, { status: 404 });\n      }\n      if (asset.plantId !== resolvedPlantId) {\n        return NextResponse.json(\n          { success: false, error: 'Asset does not belong to the selected plant' },\n          { status: 400 },\n        );\n      }\n      resolvedAssetName = asset.name;\n    }\n\n    let resolvedDepartmentId: string | null = departmentId || null;\n"""
if old not in text:
    raise SystemExit('asset validation block not found')
text = text.replace(old, new, 1)

text = text.replace('        assetName: assetName || null,', '        assetName: resolvedAssetName,', 1)
text = text.replace("      const assetInfo = assetName || '';", "      const assetInfo = resolvedAssetName || '';", 1)
path.write_text(text, encoding='utf-8')
print('✓ Maintenance Request API hardened')
PY

echo
echo "[4/8] Remove visible standalone Enterprise wording..."
python3 <<'PY'
from pathlib import Path
import re, subprocess

extensions = {'.ts','.tsx','.js','.jsx','.mjs','.cjs','.json','.webmanifest','.html','.css','.svg'}
tracked = subprocess.check_output(['git','ls-files','-z','src','public']).decode().split('\0')
changed = []
for rel in tracked:
    if not rel:
        continue
    p = Path(rel)
    if not p.is_file() or p.suffix.lower() not in extensions:
        continue
    raw = p.read_bytes()
    if b'\x00' in raw:
        continue
    try:
        text = raw.decode('utf-8')
    except UnicodeDecodeError:
        continue
    original = text
    text = re.sub(r'\bEnterprise\b[ \t]*', '', text)
    text = text.replace('access Reporting.', 'access reporting.')
    if text != original:
        p.write_text(text, encoding='utf-8')
        changed.append(rel)
print(f'✓ Branding changed in {len(changed)} runtime files')
for rel in changed:
    print('  ' + rel)
PY

if git grep -n -w Enterprise -- src public; then
  echo "STOP: visible standalone Enterprise wording remains."
  exit 1
fi

echo
echo "[5/8] Add regression tests..."
mkdir -p src/components/modules/__tests__ src/__tests__/branding
cat > src/components/modules/__tests__/create-maintenance-request-ux.test.ts <<'TEST'
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = readFileSync(join(process.cwd(), 'src/components/modules/MaintenancePages.tsx'), 'utf8');
const start = source.indexOf('export function CreateMRForm');
const end = source.indexOf('// MR DETAIL PAGE', start);
const form = source.slice(start, end);

describe('Create Maintenance Request UX', () => {
  it('renders Location exactly once and never conditions it on down status', () => {
    expect(form.match(/<Label>Location<\/Label>/g) || []).toHaveLength(1);
    expect(form).not.toContain("itemType === 'machine' && !machineDown");
  });

  it('provides direct manual entry without a nested asset picker', () => {
    expect(form).toContain('Asset / Item Name *');
    expect(form).not.toContain('manualMode');
    expect(form).not.toContain('manualAssetId');
    expect(form).not.toContain('__create_new__');
  });

  it('passes typed text to server-side asset search', () => {
    expect(form).toContain('const fetchAssetOptions = useCallback(async (query: string)');
    expect(form).toContain("params.set('search', q)");
    expect(form).toContain('fetchOptions={fetchAssetOptions}');
  });

  it('validates both registered and manual asset modes', () => {
    expect(form).toContain("assetMode === 'registered' && !assetId");
    expect(form).toContain("assetMode === 'manual' && !cleanManualAssetName");
  });

  it('does not clear location when switching asset modes', () => {
    const a = form.slice(form.indexOf('const switchToRegistered'), form.indexOf('const handleSubmit'));
    expect(a).not.toContain("setLocation('')");
  });
});
TEST

cat > src/__tests__/branding/no-enterprise-ui-text.test.ts <<'TEST'
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

const allowed = new Set(['.ts','.tsx','.js','.jsx','.mjs','.cjs','.json','.webmanifest','.html','.css','.svg']);
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : allowed.has(extname(p).toLowerCase()) ? [p] : [];
  });
}

describe('runtime branding', () => {
  it('contains no standalone legacy branding word', () => {
    const oldWord = 'Enter' + 'prise';
    const rx = new RegExp(`\\b${oldWord}\\b`, 'g');
    const violations: string[] = [];
    for (const root of [join(process.cwd(), 'src'), join(process.cwd(), 'public')]) {
      for (const file of walk(root)) {
        if (rx.test(readFileSync(file, 'utf8'))) violations.push(file);
        rx.lastIndex = 0;
      }
    }
    expect(violations).toEqual([]);
  });
});
TEST

echo
echo "[6/8] Source gates..."
LOCATION_COUNT="$(python3 - <<'PY'
from pathlib import Path
s=Path('src/components/modules/MaintenancePages.tsx').read_text()
a=s.index('export function CreateMRForm')
b=s.index('// MR DETAIL PAGE',a)
print(s[a:b].count('<Label>Location</Label>'))
PY
)"
echo "CreateMRForm Location field count: $LOCATION_COUNT"
[[ "$LOCATION_COUNT" == "1" ]] || { echo "STOP: Location count must be 1."; exit 1; }
! git grep -n "itemType === 'machine' && !machineDown" -- src/components/modules/MaintenancePages.tsx
! git grep -n -E 'manualMode|manualAssetId|__create_new__' -- src/components/modules/MaintenancePages.tsx
! git grep -n -w Enterprise -- src public
git diff --check

echo
echo "[7/8] Validate tests, Repairs TypeScript, and production build..."
runuser -u lightworld -- env HOME=/home/lightworld bash -lc "
set -euo pipefail
cd '$WORK'
bun install --frozen-lockfile
bunx prisma generate
bunx vitest run src/components/modules/__tests__/create-maintenance-request-ux.test.ts src/__tests__/branding/no-enterprise-ui-text.test.ts
bunx tsc -p tsconfig.repairs.json --noEmit
bun run build
"

echo
echo "[8/8] Remove helper, commit, and push final branch..."
rm -f "$HELPER_REL"
git add -A
git diff --cached --check
git diff --cached --stat

git -c user.name="CHRISTIAN AGBOTAH" -c user.email="148919415+christianagbotah@users.noreply.github.com" \
  commit -m "Fix maintenance request asset UX and branding"
git push origin HEAD:"$BRANCH"

echo
echo "============================================================"
echo " FIXES PUSHED AND READY FOR REVIEW"
echo "============================================================"
git log -1 --oneline
echo "SHA: $(git rev-parse HEAD)"
echo "Changed files from main:"
git diff "$BASE_SHA"...HEAD --name-only
echo
echo "Live production remains untouched:"
curl -fsS --max-time 15 http://127.0.0.1:3001/api/health
echo
