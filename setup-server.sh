#!/usr/bin/env bash
set -euo pipefail

cat >&2 <<'EOF'
This legacy standalone installer has been retired.

iAssetsPro now uses PostgreSQL and must not be provisioned with the former
hard-coded MySQL credentials.

Supported provisioning paths:
  1. Hardened GitHub artifact deployment (staging/production)
  2. docker-compose.yml for container-based environments
  3. scripts/bootstrap-postgresql-staging.sh for the controlled staging cutover

For a new server, provision PostgreSQL securely first, then use the immutable
GitHub release pipeline.
EOF

exit 1
