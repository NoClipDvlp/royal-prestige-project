#!/usr/bin/env bash
# Runner de tests de aislamiento RLS (NO core).
# Levanta un Postgres EFÍMERO (sin Docker), carga schema+RLS+seed+fixtures y corre las aserciones.
# Sale ≠0 si cualquier test falla (sustituto del core-guard, exigido por ADR-0003).
set -euo pipefail

PGBIN="/opt/homebrew/opt/postgresql@17/bin"
export PATH="$PGBIN:$PATH"
# Locale estable y portable (evita "configuración regional inválida" en macOS).
export LC_ALL=C LANG=C

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
TMP="$(mktemp -d)"
DATA="$TMP/pgdata"
SOCK="$TMP/sock"
PORT=55432
mkdir -p "$SOCK"

cleanup() {
  pg_ctl -D "$DATA" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$TMP" || true
}
trap cleanup EXIT

echo "== initdb (cluster efímero) =="
initdb -D "$DATA" -U postgres --auth=trust --locale=C --encoding=UTF8 >/dev/null

echo "== arrancar postgres (solo socket unix) =="
pg_ctl -D "$DATA" -o "-p $PORT -k $SOCK -c listen_addresses=''" -w start >/dev/null

export PGHOST="$SOCK" PGPORT="$PORT" PGUSER=postgres
createdb rc_test

run() { psql -v ON_ERROR_STOP=1 -X -q -d rc_test -f "$1"; }

echo "== shim de auth ==";        run "$HERE/00_auth_shim.sql"
echo "== schema 0000_init ==";    run "$ROOT/db/migrations/0000_init.sql"
echo "== RLS policies ==";        run "$ROOT/lib/rls-policies/policies.sql"
echo "== seed roles ==";          run "$ROOT/db/seed/roles.sql"
echo "== fixtures ==";            run "$HERE/10_fixtures.sql"
echo "== tests de aislamiento =="; run "$HERE/20_isolation_tests.sql"

echo "RESULT=GREEN"
