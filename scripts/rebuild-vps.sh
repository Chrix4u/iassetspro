#!/usr/bin/env bash
# Legacy in-place VPS rebuild helper — intentionally disabled.
#
# iAssetsPro production now deploys immutable artifacts built and tested by
# GitHub Actions. Rebuilding in place, rewriting .env, or pushing schema changes
# from a server shell can bypass release provenance and database safety gates.

set -euo pipefail

echo "STOP: scripts/rebuild-vps.sh is a retired legacy deployment path." >&2
echo "Use the GitHub CI -> Deploy workflow (immutable production-release artifact)." >&2
echo "For an explicit manual artifact deployment, use scripts/deploy-production-artifact.sh." >&2
exit 1
