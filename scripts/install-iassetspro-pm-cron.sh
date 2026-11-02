#!/usr/bin/env bash
set -euo pipefail

APP_LINK="${DEPLOY_PATH:-/home/lightworld/webapps/iassetspro}"
CRON_FILE="${PM_CRON_CRON_FILE:-/etc/cron.d/iassetspro-pm}"
TIMEZONE="${PM_AUTOMATION_TZ:-Africa/Accra}"
RUNNER="${APP_LINK}/scripts/iassetspro-pm-cron.sh"

render_cron() {
  cat <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
CRON_TZ=${TIMEZONE}
*/5 * * * * root ${RUNNER} >/dev/null 2>&1
EOF
}

filter_legacy_crontab() {
  awk '!/[[:space:]]# iassetspro-pm-cron[[:space:]]*$/'
}

case "${1:-}" in
  --render)
    render_cron
    exit 0
    ;;
  --filter-legacy-crontab)
    filter_legacy_crontab
    exit 0
    ;;
  '')
    ;;
  *)
    printf 'Unknown option: %s\n' "$1" >&2
    exit 2
    ;;
esac

if [[ "${EUID}" -ne 0 ]]; then
  printf 'iAssetsPro PM cron installation failed: root is required.\n' >&2
  exit 1
fi

if [[ ! -x "$RUNNER" ]]; then
  printf 'iAssetsPro PM cron installation failed: runner is not executable: %s\n' "$RUNNER" >&2
  exit 1
fi

if ! command -v crontab >/dev/null 2>&1; then
  printf 'iAssetsPro PM cron installation failed: crontab command is unavailable.\n' >&2
  exit 1
fi

CRON_DIR="$(dirname "$CRON_FILE")"
mkdir -p "$CRON_DIR"
TMP_FILE="$(mktemp "${CRON_DIR}/.iassetspro-pm.XXXXXX")"
trap 'rm -f "$TMP_FILE"' EXIT
render_cron > "$TMP_FILE"
chmod 0644 "$TMP_FILE"
mv -f "$TMP_FILE" "$CRON_FILE"
trap - EXIT

EXISTING_CRONTAB="$(crontab -l 2>/dev/null || true)"
FILTERED_CRONTAB="$(printf '%s\n' "$EXISTING_CRONTAB" | filter_legacy_crontab)"
if [[ "$FILTERED_CRONTAB" != "$EXISTING_CRONTAB" ]]; then
  if [[ -n "$FILTERED_CRONTAB" ]]; then
    printf '%s\n' "$FILTERED_CRONTAB" | crontab -
  else
    crontab -r 2>/dev/null || true
  fi
fi

printf 'Installed iAssetsPro PM cron: %s\n' "$CRON_FILE"
