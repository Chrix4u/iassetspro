#!/usr/bin/env bash
set -euo pipefail

EXPECTED_MAIN="b4511cb35ed7491717f904fd070f1c5f9977a9b3"
VALIDATED_FEATURE="d90e8fc0d08493bbb9a8e7bb1c94530c9b4a77b5"
EXPECTED_TREE="eb3b73ad1b975ea49b522e69dd47e2c131777198"
APP_LINK="/home/lightworld/webapps/iassetspro"
PROD_PORT="3001"
PUBLIC_URL="https://iassetspro.lightworldtech.com"
MIN_FREE_BYTES=$((8 * 1024 * 1024 * 1024))

[[ "$(id -u)" -eq 0 ]] || { echo "STOP: run as root"; exit 1; }

ACTIVE="$(readlink -f "$APP_LINK")"
[[ -n "$ACTIVE" && -d "$ACTIVE/.git" ]] || { echo "STOP: active production release is invalid: $ACTIVE"; exit 1; }

cd "$ACTIVE"
git fetch origin main fix/technician-workflow-v1-1-completion
MAIN_SHA="$(git rev-parse origin/main)"
FEATURE_SHA="$(git rev-parse origin/fix/technician-workflow-v1-1-completion)"
MAIN_TREE="$(git rev-parse "${MAIN_SHA}^{tree}")"
FEATURE_TREE="$(git rev-parse "${FEATURE_SHA}^{tree}")"

printf '%s\n' "============================================================" \
  " iAssetsPro — TECHNICIAN WORKFLOW V1.1 MERGED DEPLOYMENT" \
  "============================================================" \
  "origin/main      : $MAIN_SHA" \
  "validated feature: $FEATURE_SHA" \
  "main tree        : $MAIN_TREE" \
  "feature tree     : $FEATURE_TREE" \
  "active release   : $ACTIVE"

[[ "$MAIN_SHA" == "$EXPECTED_MAIN" ]] || { echo "STOP: origin/main moved; expected $EXPECTED_MAIN"; exit 1; }
[[ "$FEATURE_SHA" == "$VALIDATED_FEATURE" ]] || { echo "STOP: feature head moved; expected $VALIDATED_FEATURE"; exit 1; }
[[ "$MAIN_TREE" == "$FEATURE_TREE" && "$MAIN_TREE" == "$EXPECTED_TREE" ]] || {
  echo "STOP: merged main tree is not byte-for-byte identical to the validated feature tree"
  exit 1
}

echo "===== CURRENT PRODUCTION HEALTH ====="
CODE="$(curl -sS -o /tmp/iassetspro-v11-predeploy-health.json -w '%{http_code}' --max-time 10 "http://127.0.0.1:${PROD_PORT}/api/health" || true)"
echo "Local production HTTP: $CODE"
[[ "$CODE" == "200" ]] || { echo "STOP: current production is unhealthy"; exit 1; }

echo "===== DISK SPACE PREFLIGHT ====="
AVAILABLE_BYTES="$(df --output=avail -B1 / | tail -1 | tr -d ' ')"
echo "Available bytes: $AVAILABLE_BYTES"
echo "Required min  : $MIN_FREE_BYTES"
[[ "$AVAILABLE_BYTES" =~ ^[0-9]+$ ]] || { echo "STOP: unable to determine free disk space"; exit 1; }
[[ "$AVAILABLE_BYTES" -ge "$MIN_FREE_BYTES" ]] || {
  echo "STOP: less than 8 GiB free; do not create another immutable release until space is recovered"
  df -h /
  exit 1
}

echo "===== PERSISTENT STORAGE SAFETY CHECK ====="
check_storage_path() {
  local path="$1"
  [[ -e "$path" || -L "$path" ]] || return 0

  if [[ -L "$path" ]]; then
    local target
    target="$(readlink -f "$path" || true)"
    echo "SYMLINK: $path -> ${target:-UNRESOLVED}"
    [[ -n "$target" && -e "$target" ]] || { echo "STOP: storage symlink target is missing"; exit 1; }
    case "$target" in
      "$ACTIVE"/*)
        echo "STOP: storage symlink resolves inside the immutable active release and is not persistent: $target"
        exit 1
        ;;
    esac
    return 0
  fi

  if [[ -d "$path" ]]; then
    if find "$path" -mindepth 1 -print -quit | grep -q .; then
      echo "STOP: release-local storage contains persistent-looking data: $path"
      du -sh "$path" || true
      echo "Move/link this data to shared persistent storage before cutover. No production mutation has occurred."
      exit 1
    fi
    echo "EMPTY release-local directory: $path"
  fi
}

check_storage_path "$ACTIVE/data/storage"
check_storage_path "$ACTIVE/storage"
check_storage_path "$ACTIVE/public/uploads"
check_storage_path "$ACTIVE/uploads"

echo "Storage safety preflight passed."

echo "===== FETCH AUTHORITATIVE DEPLOYER FROM MERGED MAIN ====="
DEPLOYER="/tmp/iassetspro-v11-deploy-${EXPECTED_MAIN:0:12}.sh"
git show "${EXPECTED_MAIN}:scripts/deploy-production-release.sh" > "$DEPLOYER"
bash -n "$DEPLOYER"
chmod +x "$DEPLOYER"

echo "===== START RELEASE-BASED CANARY DEPLOYMENT ====="
RELEASE_SHA="$EXPECTED_MAIN" \
DEPLOY_PATH="$APP_LINK" \
PRODUCTION_PORT="$PROD_PORT" \
PRODUCTION_URL="$PUBLIC_URL" \
  "$DEPLOYER"
