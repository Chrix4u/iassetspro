#!/usr/bin/env bash
set -euo pipefail

APP_LINK="${DEPLOY_PATH:-/home/lightworld/webapps/iassetspro}"
PROD_PORT="${PRODUCTION_PORT:-3001}"
ENV_FILE="${PM_CRON_ENV_FILE:-${APP_LINK}/.env}"
STATUS_ENDPOINT="${PM_AUTOMATION_STATUS_ENDPOINT:-http://127.0.0.1:${PROD_PORT}/api/pm-automation/status}"
ENDPOINT="${PM_CRON_ENDPOINT:-http://127.0.0.1:${PROD_PORT}/api/pm-schedules/check-due-cron}"
LOG_DIR="${PM_CRON_LOG_DIR:-/home/lightworld/logs/iassetspro-pm}"
LOCK_FILE="${PM_CRON_LOCK_FILE:-/run/lock/iassetspro-pm-cron.lock}"
export TZ="${PM_AUTOMATION_TZ:-Africa/Accra}"

mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/cron.log"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  printf '%s skip=overlap\n' "$(date -Is)" >> "$LOG_FILE"
  exit 0
fi

if [[ ! -r "$ENV_FILE" ]]; then
  printf '%s status=error reason=env_unreadable\n' "$(date -Is)" >> "$LOG_FILE"
  exit 1
fi

SECRET="$(node --env-file="$ENV_FILE" -e 'process.stdout.write(process.env.PM_CRON_SECRET || "")')"
if [[ -z "$SECRET" ]]; then
  printf '%s status=error reason=cron_secret_missing\n' "$(date -Is)" >> "$LOG_FILE"
  exit 1
fi

if [[ "${1:-}" == "--dry-run" ]]; then
  unset SECRET
  printf '%s status=ok mode=dry-run status_endpoint=%s endpoint=%s\n' \
    "$(date -Is)" "$STATUS_ENDPOINT" "$ENDPOINT"
  exit 0
fi

STATUS_TMP="$(mktemp)"
TMP="$(mktemp)"
trap 'rm -f "$STATUS_TMP" "$TMP"' EXIT

STATUS_HTTP="$(curl -sS --max-time 30 -o "$STATUS_TMP" -w '%{http_code}' \
  -H "x-pm-cron-secret: $SECRET" \
  "$STATUS_ENDPOINT" || true)"
PRIMARY_HEALTH="unknown"
if [[ "$STATUS_HTTP" =~ ^2 ]]; then
  PRIMARY_HEALTH="$(jq -r '.data.health // "unknown"' "$STATUS_TMP" 2>/dev/null || printf 'unknown')"
fi
case "$PRIMARY_HEALTH" in
  healthy|starting|degraded|disabled) ;;
  *) PRIMARY_HEALTH="unknown" ;;
esac

if [[ "$PRIMARY_HEALTH" == "healthy" ]]; then
  unset SECRET
  printf '%s status=ok mode=watchdog primary=healthy action=skip status_http=%s\n' \
    "$(date -Is)" "$STATUS_HTTP" >> "$LOG_FILE"
  exit 0
fi

HTTP_CODE="$(curl -sS --max-time 240 -o "$TMP" -w '%{http_code}' \
  -X POST \
  -H "x-pm-cron-secret: $SECRET" \
  "$ENDPOINT" || true)"
unset SECRET

if [[ "$HTTP_CODE" =~ ^2 ]]; then
  SUMMARY="$(jq -c '{success,error,calendar:{checked:(.data.dueSchedulesChecked // .data.calendarGeneration.checked // null),generated:(.data.workOrdersGenerated // .data.calendarGeneration.generated // null)},runtime:{evaluated:(.data.runtimeTriggers.evaluated // null),generated:(.data.runtimeTriggers.generated // null)},overdue:{found:(.data.overdueSchedulesFound // null),alerts:(.data.overdueAlertsSent // null)}}' "$TMP" 2>/dev/null || printf '{"parse":"failed"}')"
  printf '%s mode=fallback primary=%s status_http=%s status=ok http=%s summary=%s\n' \
    "$(date -Is)" "$PRIMARY_HEALTH" "${STATUS_HTTP:-000}" "$HTTP_CODE" "$SUMMARY" >> "$LOG_FILE"
  exit 0
fi

BODY="$(tr '\n' ' ' < "$TMP" | head -c 1200)"
printf '%s mode=fallback primary=%s status_http=%s status=error http=%s body=%s\n' \
  "$(date -Is)" "$PRIMARY_HEALTH" "${STATUS_HTTP:-000}" "${HTTP_CODE:-000}" "$BODY" >> "$LOG_FILE"
exit 1
