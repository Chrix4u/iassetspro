#!/usr/bin/env bash
set -u

APP_LINK="${DEPLOY_PATH:-/home/lightworld/webapps/iassetspro}"
PROD_PORT="${PRODUCTION_PORT:-3001}"
PM2_NAME="${PM2_NAME:-iassetspro}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CORE_SCRIPT="${SCRIPT_DIR}/deploy-production-artifact-core.sh"

[[ "$(id -u)" -eq 0 ]] || { echo "STOP: root is required"; exit 1; }
for cmd in stat readlink curl seq pm2 ln mv; do
  command -v "$cmd" >/dev/null || { echo "STOP: missing command: $cmd" >&2; exit 1; }
done
[[ -x "$CORE_SCRIPT" ]] || {
  echo "STOP: deployment core is missing or not executable: $CORE_SCRIPT" >&2
  exit 1
}

CORE_OWNER="$(stat -c '%u' "$CORE_SCRIPT")"
CORE_MODE="$(stat -c '%A' "$CORE_SCRIPT")"
[[ "$CORE_OWNER" == "0" ]] || {
  echo "STOP: deployment core must be owned by root" >&2
  exit 1
}
[[ "${CORE_MODE:5:1}" != "w" && "${CORE_MODE:8:1}" != "w" ]] || {
  echo "STOP: deployment core must not be group/world writable" >&2
  exit 1
}

OLD_RELEASE="$(readlink -f "$APP_LINK" 2>/dev/null || true)"
[[ -n "$OLD_RELEASE" && -d "$OLD_RELEASE" ]] || {
  echo "STOP: active release missing before deployment" >&2
  exit 1
}

entrypoint_for() {
  local release="$1"
  if [[ -f "$release/server.js" ]]; then
    printf '%s\n' "$release/server.js"
  elif [[ -f "$release/.next/standalone/server.js" ]]; then
    printf '%s\n' "$release/.next/standalone/server.js"
  else
    return 1
  fi
}

health_check() {
  local url="$1" outfile="$2" attempts="${3:-18}" wait_seconds="${4:-5}" code=""
  for i in $(seq 1 "$attempts"); do
    code="$(curl -sS -o "$outfile" -w '%{http_code}' --max-time 10 "$url" 2>/dev/null || true)"
    echo "Wrapper health attempt $i/$attempts -> HTTP ${code:-000}"
    [[ "$code" == "200" ]] && return 0
    sleep "$wait_seconds"
  done
  return 1
}

restore_previous_runtime() {
  local old_entry
  old_entry="$(entrypoint_for "$OLD_RELEASE")" || {
    echo "ROLLBACK FAILED: previous runtime entrypoint is missing" >&2
    return 1
  }

  echo "WRAPPER ROLLBACK: restoring $OLD_RELEASE"
  pm2 delete "$PM2_NAME" >/dev/null 2>&1 || true
  if ! ln -sfn "$OLD_RELEASE" "${APP_LINK}.wrapper-rollback" || \
    ! mv -Tf "${APP_LINK}.wrapper-rollback" "$APP_LINK"; then
    echo "ROLLBACK FAILED: unable to restore previous release link" >&2
    return 1
  fi

  if ! PORT="$PROD_PORT" HOSTNAME=127.0.0.1 NODE_ENV=production \
    pm2 start "$old_entry" --name "$PM2_NAME" --cwd "$OLD_RELEASE" \
      --node-args="--env-file=$OLD_RELEASE/.env" --time; then
    echo "ROLLBACK FAILED: unable to restart previous PM2 runtime" >&2
    return 1
  fi

  if ! health_check "http://127.0.0.1:${PROD_PORT}/api/health" \
    /tmp/iassetspro-wrapper-rollback-health.json 18 5; then
    pm2 logs "$PM2_NAME" --lines 100 --nostream || true
    echo "ROLLBACK FAILED: previous runtime did not become healthy" >&2
    return 1
  fi

  pm2 save
  echo "WRAPPER ROLLBACK COMPLETE"
}

set +e
"$CORE_SCRIPT" "$@"
CORE_RC=$?
set -e

if [[ "$CORE_RC" -eq 0 ]]; then
  exit 0
fi

echo "Deployment core exited with status $CORE_RC; verifying production before returning failure" >&2
if health_check "http://127.0.0.1:${PROD_PORT}/api/health" \
  /tmp/iassetspro-wrapper-postfailure-health.json 3 2; then
  echo "Production remains healthy after failed deployment; no wrapper rollback required" >&2
  exit "$CORE_RC"
fi

if ! restore_previous_runtime; then
  echo "CRITICAL: deployment failed and previous production could not be restored" >&2
  exit 70
fi

exit "$CORE_RC"
