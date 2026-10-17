#!/usr/bin/env bash
set -euo pipefail
echo "STOP: scripts/fix-prisma-generate.sh is retired. Generate Prisma from the current PostgreSQL schema with npx prisma generate; never reconstruct .env from legacy MariaDB settings." >&2
exit 1
