#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/home/lightworld/webapps/iassetspro"
OPS_BRANCH="ops/technician-workflow-v1"
SOURCE="/tmp/correct-technician-workflow-v1.source.sh"
FIXED="/tmp/correct-technician-workflow-v1.fixed.sh"
PY_CHECK="/tmp/correct-technician-workflow-v1.embedded.py"

cd "$REPO_DIR"
git fetch origin "$OPS_BRANCH"
git show "origin/${OPS_BRANCH}:scripts/correct-technician-workflow-v1.sh" > "$SOURCE"
cp "$SOURCE" "$FIXED"

python3 - <<'PY'
from pathlib import Path
p = Path('/tmp/correct-technician-workflow-v1.fixed.sh')
s = p.read_text()
old = r'''insert = """    expect(page).toContain('actionDescription: actionDescription.trim()');\n"'''
new = r'''insert = "    expect(page).toContain('actionDescription: actionDescription.trim()');\n"'''
count = s.count(old)
if count != 1:
    raise SystemExit(f'STOP: expected exactly one malformed Python insert anchor, found {count}')
p.write_text(s.replace(old, new, 1))
print('Corrected malformed embedded-Python string literal.')
PY

# Validate both the shell wrapper and the embedded Python before touching the workspace.
bash -n "$FIXED"
awk 'BEGIN{capture=0} /^python3 - <<'\''PY'\''$/{capture=1; next} capture && /^PY$/{exit} capture{print}' "$FIXED" > "$PY_CHECK"
python3 -m py_compile "$PY_CHECK"
rm -rf /tmp/__pycache__

echo "Correction script syntax validated (shell + embedded Python)."
chmod +x "$FIXED"
exec "$FIXED"
