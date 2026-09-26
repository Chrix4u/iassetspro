#!/usr/bin/env bash
set -euo pipefail

TARGET_ENV="${1:-}"
SHARED_DATABASE_ENV="${POSTGRESQL_SHARED_ENV:-/home/lightworld/shared/iassetspro/postgres.env}"

[[ "$(id -u)" -eq 0 ]] || { echo "STOP: PostgreSQL bootstrap requires root"; exit 1; }
[[ -n "$TARGET_ENV" && -f "$TARGET_ENV" ]] || { echo "STOP: target release .env is missing"; exit 1; }
[[ -f "$SHARED_DATABASE_ENV" ]] || {
  echo "STOP: shared PostgreSQL configuration is missing: $SHARED_DATABASE_ENV"
  echo "Provision the isolated iAssetsPro PostgreSQL database before deployment."
  exit 1
}

for cmd in psql pg_isready node grep mktemp chmod mv; do
  command -v "$cmd" >/dev/null || { echo "STOP: missing PostgreSQL bootstrap command: $cmd"; exit 1; }
done

chmod 600 "$SHARED_DATABASE_ENV"

DATABASE_URL=""
while IFS= read -r line; do
  case "$line" in
    DATABASE_URL=*)
      DATABASE_URL="${line#DATABASE_URL=}"
      break
      ;;
  esac
done < "$SHARED_DATABASE_ENV"

[[ "$DATABASE_URL" == postgresql://* || "$DATABASE_URL" == postgres://* ]] || {
  echo "STOP: shared DATABASE_URL must use PostgreSQL"
  exit 1
}

mapfile -t DB_FIELDS < <(
  DATABASE_URL="$DATABASE_URL" node - <<'NODE'
const u = new URL(process.env.DATABASE_URL);
console.log(u.hostname);
console.log(u.port || '5432');
console.log(decodeURIComponent(u.username));
console.log(decodeURIComponent(u.password));
console.log(decodeURIComponent(u.pathname.replace(/^\//, '')));
NODE
)

PG_HOST="${DB_FIELDS[0]:-}"
PG_PORT="${DB_FIELDS[1]:-5432}"
PG_APP_USER="${DB_FIELDS[2]:-}"
PG_APP_PASSWORD="${DB_FIELDS[3]:-}"
PG_DATABASE="${DB_FIELDS[4]:-}"

[[ -n "$PG_HOST" && -n "$PG_APP_USER" && -n "$PG_APP_PASSWORD" && -n "$PG_DATABASE" ]] || {
  echo "STOP: shared PostgreSQL configuration is incomplete"
  exit 1
}

pg_isready -h "$PG_HOST" -p "$PG_PORT" -d "$PG_DATABASE" -U "$PG_APP_USER" >/dev/null || {
  echo "STOP: isolated iAssetsPro PostgreSQL is not accepting connections at $PG_HOST:$PG_PORT"
  exit 1
}

PGPASSWORD="$PG_APP_PASSWORD" psql \
  -h "$PG_HOST" -p "$PG_PORT" -U "$PG_APP_USER" -d "$PG_DATABASE" \
  -v ON_ERROR_STOP=1 -Atqc 'SELECT current_database(), current_user' >/dev/null

TMP_ENV="$(mktemp)"
trap 'rm -f "$TMP_ENV"' EXIT

grep -Ev '^(DATABASE_URL|DB_HOST|DB_PORT|DB_USER|DB_PASSWORD|DB_NAME)=' "$TARGET_ENV" > "$TMP_ENV" || true
cat >> "$TMP_ENV" <<EOF

# PostgreSQL primary database — isolated shared iAssetsPro cluster.
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

echo "PostgreSQL staging database verified at $PG_HOST:$PG_PORT/$PG_DATABASE"
echo "Database credentials remain in the root-owned shared configuration and release environment."
