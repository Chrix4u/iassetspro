#!/usr/bin/env bash
set -euo pipefail

cat >&2 <<'EOF'
UNSUPPORTED: DEPLOY.sh is retired for production deployments.

iAssetsPro production releases must use the provenance-bound GitHub Deploy workflow
and its attested privileged deployer:
  /usr/local/sbin/iassetspro-deploy-artifact

Do not deploy by updating the production working tree, rebuilding on the VPS,
or launching the Next.js standalone server manually.
EOF

exit 1
