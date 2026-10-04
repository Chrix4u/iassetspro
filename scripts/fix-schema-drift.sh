#!/usr/bin/env bash
set -euo pipefail
echo "STOP: scripts/fix-schema-drift.sh is retired. Production schema changes must use committed Prisma migrations and prisma migrate deploy." >&2
exit 1
