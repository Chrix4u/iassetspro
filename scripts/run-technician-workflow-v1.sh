#!/usr/bin/env bash
set -euo pipefail

LIVE="/home/lightworld/webapps/iassetspro"
OPS_BRANCH="ops/technician-workflow-v1"
BASE_HELPER="/tmp/apply-technician-workflow-v1.base.sh"
FINAL_HELPER="/tmp/apply-technician-workflow-v1.final.sh"

cd "$LIVE"
git fetch origin "$OPS_BRANCH"
git show "origin/${OPS_BRANCH}:scripts/apply-technician-workflow-v1.sh" > "$BASE_HELPER"
cp "$BASE_HELPER" "$FINAL_HELPER"

python3 - <<'PY'
from pathlib import Path
p = Path('/tmp/apply-technician-workflow-v1.final.sh')
s = p.read_text()

# The large MaintenancePages module contains another Created column in a recent-WO
# dashboard table. Scope the list-table edits with surrounding WorkOrders-only
# context instead of relying on a globally unique one-line anchor.
old = '''replace_once(\n    'src/components/modules/MaintenancePages.tsx',\n    \"                <TableHead className=\\\"hidden md:table-cell\\\">Created</TableHead>\\n\",\n    \"                <TableHead className=\\\"hidden md:table-cell\\\">Created</TableHead>\\n                <TableHead className=\\\"text-right\\\">Action</TableHead>\\n\",\n    'work-order explicit action header',\n)\nreplace_once(\n    'src/components/modules/MaintenancePages.tsx',\n    '<TableRow><TableCell colSpan={7} className=\"h-48\">',\n    '<TableRow><TableCell colSpan={8} className=\"h-48\">',\n    'work-order table colspan',\n)\nreplace_once(\n    'src/components/modules/MaintenancePages.tsx',\n    \"                  <TableCell className=\\\"text-xs text-muted-foreground hidden md:table-cell\\\">{formatDate(wo.createdAt)}</TableCell>\\n\",\n    \"                  <TableCell className=\\\"text-xs text-muted-foreground hidden md:table-cell\\\">{formatDate(wo.createdAt)}</TableCell>\\n\"\n    \"                  <TableCell className=\\\"text-right\\\">\\n\"\n    \"                    <Button variant=\\\"outline\\\" size=\\\"sm\\\" onClick={(e) => { e.stopPropagation(); navigate('wo-detail', { id: wo.id }); }}>Open Work Order</Button>\\n\"\n    \"                  </TableCell>\\n\",\n    'work-order explicit open button',\n)\n'''
new = '''replace_once(\n    'src/components/modules/MaintenancePages.tsx',\n    \"                <TableHead className=\\\"hidden md:table-cell\\\">Type</TableHead>\\n                <TableHead className=\\\"hidden sm:table-cell\\\">Priority</TableHead>\\n                <TableHead>Status</TableHead>\\n                <TableHead className=\\\"hidden lg:table-cell\\\">Assigned To</TableHead>\\n                <TableHead className=\\\"hidden md:table-cell\\\">Created</TableHead>\\n\",\n    \"                <TableHead className=\\\"hidden md:table-cell\\\">Type</TableHead>\\n                <TableHead className=\\\"hidden sm:table-cell\\\">Priority</TableHead>\\n                <TableHead>Status</TableHead>\\n                <TableHead className=\\\"hidden lg:table-cell\\\">Assigned To</TableHead>\\n                <TableHead className=\\\"hidden md:table-cell\\\">Created</TableHead>\\n                <TableHead className=\\\"text-right\\\">Action</TableHead>\\n\",\n    'work-order explicit action header',\n)\nreplace_once(\n    'src/components/modules/MaintenancePages.tsx',\n    \"              {filteredWOs.length === 0 ? (\\n                <TableRow><TableCell colSpan={7} className=\\\"h-48\\\">\",\n    \"              {filteredWOs.length === 0 ? (\\n                <TableRow><TableCell colSpan={8} className=\\\"h-48\\\">\",\n    'work-order table colspan',\n)\nreplace_once(\n    'src/components/modules/MaintenancePages.tsx',\n    \"                  <TableCell className=\\\"text-sm hidden lg:table-cell\\\">{wo.assignee?.fullName || (wo.teamMembers?.length > 0 ? <span className=\\\"text-muted-foreground\\\">Team ({wo.teamMembers.length})</span> : <span className=\\\"text-muted-foreground\\\">Unassigned</span>)}</TableCell>\\n                  <TableCell className=\\\"text-xs text-muted-foreground hidden md:table-cell\\\">{formatDate(wo.createdAt)}</TableCell>\\n\",\n    \"                  <TableCell className=\\\"text-sm hidden lg:table-cell\\\">{wo.assignee?.fullName || (wo.teamMembers?.length > 0 ? <span className=\\\"text-muted-foreground\\\">Team ({wo.teamMembers.length})</span> : <span className=\\\"text-muted-foreground\\\">Unassigned</span>)}</TableCell>\\n                  <TableCell className=\\\"text-xs text-muted-foreground hidden md:table-cell\\\">{formatDate(wo.createdAt)}</TableCell>\\n                  <TableCell className=\\\"text-right\\\">\\n                    <Button variant=\\\"outline\\\" size=\\\"sm\\\" onClick={(e) => { e.stopPropagation(); navigate('wo-detail', { id: wo.id }); }}>Open Work Order</Button>\\n                  </TableCell>\\n\",\n    'work-order explicit open button',\n)\n'''
if old not in s:
    raise SystemExit('STOP: could not harden the WorkOrders table patch in helper')
s = s.replace(old, new, 1)
p.write_text(s)
PY

chmod +x "$FINAL_HELPER"
exec "$FINAL_HELPER"
