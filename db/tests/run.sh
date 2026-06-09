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
echo "== migración 0001 (auditor labels) =="; run "$ROOT/db/migrations/0001_auditor_labels.sql"
echo "== seed roles ==";          run "$ROOT/db/seed/roles.sql"
echo "== fixtures ==";            run "$HERE/10_fixtures.sql"
# 0002 se carga DESPUÉS de fixtures a propósito: las fixtures insertan auth.users + public.users
# explícitamente; con el trigger activo antes, handle_new_user duplicaría el INSERT en public.users.
# En PRODUCCIÓN 0002 corre antes de cualquier signup (comportamiento idéntico; solo es orden de carga).
echo "== migración 0002 (auth profile) =="; run "$ROOT/db/migrations/0002_auth_profile.sql"
echo "== migración 0003 (tasks engine) =="; run "$ROOT/db/migrations/0003_tasks_engine.sql"
echo "== migración 0004 (tasks premium) =="; run "$ROOT/db/migrations/0004_tasks_premium.sql"
echo "== migración 0005 (metrics) =="; run "$ROOT/db/migrations/0005_metrics.sql"
echo "== migración 0006 (bi) =="; run "$ROOT/db/migrations/0006_bi.sql"
echo "== migración 0008 (templates) =="; run "$ROOT/db/migrations/0008_templates.sql"
echo "== migración 0009 (series by user) =="; run "$ROOT/db/migrations/0009_series_by_user.sql"
echo "== migración 0010 (customized trigger) =="; run "$ROOT/db/migrations/0010_customized_trigger.sql"
echo "== migración 0011 (user delete fks) =="; run "$ROOT/db/migrations/0011_user_delete_fks.sql"
echo "== migración 0012 (weekly multi-día) =="; run "$ROOT/db/migrations/0012_weekly_multiday.sql"
echo "== migración 0013 (kpi excluye borradas) =="; run "$ROOT/db/migrations/0013_kpi_excluye_borradas.sql"
echo "== migración 0014 (must_set_password) =="; run "$ROOT/db/migrations/0014_must_set_password.sql"
echo "== migración 0015 (template_item emoji) =="; run "$ROOT/db/migrations/0015_template_item_emoji.sql"
echo "== tests de aislamiento (20) =="; run "$HERE/20_isolation_tests.sql"
echo "== tests auditor labels (21) =="; run "$HERE/21_auditor_labels.sql"
echo "== tests auth profile (22) =="; run "$HERE/22_auth_profile.sql"
echo "== tests tasks engine (23) =="; run "$HERE/23_tasks_engine.sql"
echo "== tests tasks premium (24) =="; run "$HERE/24_tasks_premium.sql"
echo "== tests metrics (25) =="; run "$HERE/25_metrics.sql"
echo "== tests bi (26) =="; run "$HERE/26_bi.sql"
echo "== tests templates (28) =="; run "$HERE/28_templates.sql"
echo "== tests customized/propagación (30) =="; run "$HERE/30_customized.sql"
echo "== tests series by user (31) =="; run "$HERE/31_series_by_user.sql"
echo "== tests user delete (32) =="; run "$HERE/32_user_delete.sql"
echo "== tests weekly multi-día (33) =="; run "$HERE/33_weekly_multiday.sql"
echo "== tests kpi excluye borradas (34) =="; run "$HERE/34_kpi_excludes_deleted.sql"
echo "== tests must_set_password (35) =="; run "$HERE/35_must_set_password.sql"
echo "== tests siembra propagación (36) =="; run "$HERE/36_propagate_seed.sql"

echo "RESULT=GREEN"
