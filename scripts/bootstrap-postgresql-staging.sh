#!/usr/bin/env bash
set -euo pipefail

TARGET_ENV="${1:-}"
CONFIG_DIR="${POSTGRESQL_CONFIG_DIR:-/home/lightworld/config}"
CONFIG_FILE="${POSTGRESQL_CONFIG_FILE:-${CONFIG_DIR}/iassetspro-postgresql.env}"
PG_APP_USER="${POSTGRESQL_APP_USER:-iassetspro_app}"
PG_DATABASE="${POSTGRESQL_DATABASE:-lightworld_iassetspro_pg}"
PG_HOST="${POSTGRESQL_HOST:-127.0.0.1}"
PG_PORT="${POSTGRESQL_PORT:-5432}"

[[ "$(id -u)" -eq 0 ]] || { echo "STOP: PostgreSQL bootstrap requires root"; exit 1; }
[[ -n "$TARGET_ENV" && -f "$TARGET_ENV" ]] || { echo "STOP: target release .env is missing"; exit 1; }

for cmd in psql pg_isready runuser od tr grep mktemp install chmod mv; do
  command -v "$cmd" >/dev/null || { echo "STOP: missing PostgreSQL bootstrap command: $cmd"; exit 1; }
done

id postgres >/dev/null 2>&1 || { echo "STOP: postgres operating-system account is unavailable"; exit 1; }
pg_isready -h "$PG_HOST" -p "$PG_PORT" >/dev/null || { echo "STOP: local PostgreSQL is not accepting connections"; exit 1; }

install -d -m 700 "$CONFIG_DIR"

if [[ -f "$CONFIG_FILE" ]]; then
  chmod 600 "$CONFIG_FILE"
  # This file is created only by this root-owned bootstrap script and contains
  # shell-safe hex/alphanumeric values.
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
  : "${PG_APP_PASSWORD:?PostgreSQL config is missing PG_APP_PASSWORD}"
  : "${PG_APP_USER:?PostgreSQL config is missing PG_APP_USER}"
  : "${PG_DATABASE:?PostgreSQL config is missing PG_DATABASE}"
else
  PG_APP_PASSWORD="$(od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"
  [[ "${#PG_APP_PASSWORD}" -eq 64 ]] || { echo "STOP: failed to generate PostgreSQL credential"; exit 1; }

  runuser -u postgres -- psql -d postgres -v ON_ERROR_STOP=1 \
    -v app_user="$PG_APP_USER" \
    -v app_password="$PG_APP_PASSWORD" \
    -v app_database="$PG_DATABASE" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN', :'app_user')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user') \gexec
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'app_user', :'app_password') \gexec
SELECT format('CREATE DATABASE %I OWNER %I ENCODING %L', :'app_database', :'app_user', 'UTF8')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'app_database') \gexec
SELECT format('ALTER DATABASE %I OWNER TO %I', :'app_database', :'app_user') \gexec
SQL

  umask 077
  cat > "$CONFIG_FILE" <<EOF
PG_APP_USER=$PG_APP_USER
PG_APP_PASSWORD=$PG_APP_PASSWORD
PG_DATABASE=$PG_DATABASE
PG_HOST=$PG_HOST
PG_PORT=$PG_PORT
EOF
  chmod 600 "$CONFIG_FILE"
fi

# Reconcile role/database even when a persistent config already existed. This
# makes retries safe after an interrupted first cutover.
runuser -u postgres -- psql -d postgres -v ON_ERROR_STOP=1 \
  -v app_user="$PG_APP_USER" \
  -v app_password="$PG_APP_PASSWORD" \
  -v app_database="$PG_DATABASE" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN', :'app_user')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'app_user') \gexec
SELECT format('ALTER ROLE %I WITH LOGIN PASSWORD %L', :'app_user', :'app_password') \gexec
SELECT format('CREATE DATABASE %I OWNER %I ENCODING %L', :'app_database', :'app_user', 'UTF8')
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = :'app_database') \gexec
SELECT format('ALTER DATABASE %I OWNER TO %I', :'app_database', :'app_user') \gexec
SQL

PGPASSWORD="$PG_APP_PASSWORD" psql \
  -h "$PG_HOST" -p "$PG_PORT" -U "$PG_APP_USER" -d "$PG_DATABASE" \
  -v ON_ERROR_STOP=1 -Atqc 'SELECT current_database(), current_user' >/dev/null

DATABASE_URL="postgresql://$PG_APP_USER:$PG_APP_PASSWORD@$PG_HOST:$PG_PORT/$PG_DATABASE?schema=public"
TMP_ENV="$(mktemp)"
trap 'rm -f "$TMP_ENV"' EXIT

grep -Ev '^(DATABASE_URL|DB_HOST|DB_PORT|DB_USER|DB_PASSWORD|DB_NAME)=' "$TARGET_ENV" > "$TMP_ENV" || true
cat >> "$TMP_ENV" <<EOF

# PostgreSQL primary database — managed by iAssetsPro staging bootstrap.
DATABASE_URL=$DATABASE_URL
DB_HOST=$PG_HOST
DB_PORT=$PG_PORT
DB_USER=$PG_APP_USER
DB_PASSWORD=$PG_APP_PASSWORD
DB_NAME=$PG_DATABASE
EOF

chmod --reference="$TARGET_ENV" "$TMP_ENV" 2>/dev/null || chmod 600 "$TMP_ENV"
mv "$TMP_ENV" "$TARGET_ENV"
trap - EXIT

echo "PostgreSQL staging database is configured at $PG_HOST:$PG_PORT/$PG_DATABASE"
echo "Database credential is stored only in root-owned server configuration and the release environment."
