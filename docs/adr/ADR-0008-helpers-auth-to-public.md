# ADR-0008 — Mover los helpers de RLS del schema `auth` a `public` (fix de despliegue)

- **Estado:** aceptado (Nicolas, 2026-06-03)
- **Fecha:** 2026-06-03
- **Decisor:** Nicolas (humano) — autoridad final
- **Redactó:** Orquestador (Claude Cowork)
- **Insumo técnico de:** Agente (Claude Code) — análisis + alcance verificado por grep
- **¿Toca /core?:** SÍ → `db/migrations/0000_init.sql`, `lib/rls-policies/policies.sql`,
  `db/migrations/0001_auditor_labels.sql`, `db/migrations/0003_tasks_engine.sql`. Aprobación humana:
  2026-06-03 (Nicolas, vía Orquestador). Ejecución con **DISCIPLINA REFORZADA** (core-guard caído, DEBT-0001 ítem 1).

## Contexto

Al desplegar en Supabase real (validación E2E, DEBT-0006), el SQL falló en `0000_init` con
`ERROR 42501: permission denied for schema auth`: Supabase no permite crear objetos en el schema
`auth` (es de `supabase_auth_admin`). El código define ahí `auth.current_role()` y
`auth.current_distribution()`. **La validación E2E —que se decidió hacer antes de métricas— cazó
este supuesto roto que el shim local no podía reproducir** (en el shim somos owners de `auth`).

El Agente ya lo había señalado como riesgo en ADR-0006 ("algunos equipos moverían los helpers a un
schema propio"). Se materializó.

## Decisión

Score final: **4.7**. **Mover los dos helpers de `auth` a `public`**, renombrados para no chocar con
la palabra reservada `current_role`:
- `auth.current_role()` → `public.app_current_role()`
- `auth.current_distribution()` → `public.app_current_distribution()`

(Convención `app_*` ya usada por `public.app_today()` de 0003 → consistente.) Se conserva
`SECURITY DEFINER` + `set search_path=''`. En `public` el owner sigue siendo `postgres` (BYPASSRLS),
así que el bypass de RLS para leer `public.users` **se mantiene**; `EXECUTE` a `public` ya está
concedido a `authenticated`/`anon`. **La semántica de la RLS no cambia** — solo el namespace/nombre.

### Alcance exacto (referencias verificadas por el Agente)
- `db/migrations/0000_init.sql` — 2 definiciones + 1 llamada (en `forbid_self_privilege_escalation`).
- `lib/rls-policies/policies.sql` — 79 referencias (todas las policies). Reemplazo global.
- `db/migrations/0001_auditor_labels.sql` — vista `users_labels` (WHERE) + ALTER `users_select` + 1 comentario.
- `db/migrations/0003_tasks_engine.sql` — ALTER `tasks_delete`.

### Lo que NO cambia
- **`db/migrations/0002_auth_profile.sql`**: sus funciones (`handle_new_user`, `sync_auth_providers`)
  ya están en `public`; sus triggers son `ON auth.users`/`auth.identities`. **Verificado en el proyecto
  real (2026-06-03):** crear un trigger `ON auth.users` SÍ está permitido (test manual pasó). 0002 queda igual.
- `auth.uid()` (lo provee Supabase). `lib/auth/server.ts` (calcula el rol con query a `users`, no usa el
  helper SQL). Los tests del harness (ejercitan las policies, no nombran el helper) → siguen verdes.

## Qué se borró / simplificó

- La ubicación de los helpers en el schema `auth` (no nos pertenece) → eliminada. Convención: las
  funciones propias viven en `public` (o un schema app), nunca en `auth`.

## Riesgos

- **[BAJO]** Renombre mecánico; el harness (suites 20–23) debe seguir VERDE tras el cambio (mismo
  resultado, mismo gating). Lo confirma la suite.
- **[Nota de migraciones]** Editar `0000`/`0001`/`0003` **en sitio** es correcto AHORA porque el deploy
  falló en `0000` → no hay DB real con el schema viejo aplicado. Si ya existiera, sería migración forward.

## Verificación obligatoria

- Suites 20/21/22/23 del harness VERDES tras el renombre (sin cambio de semántica).
- `grep` confirma 0 referencias residuales a `auth.current_role` / `auth.current_distribution`.
- Re-aplicar el consolidado corregido en Supabase real pasa sin `42501` (lo confirma Nicolas).

## Trazabilidad

- Relaciona: `ADR-0003`, `ADR-0006`, `DEBT-0006`, `docs/DEPLOY.md`
- Archivos core: `0000_init`, `policies.sql`, `0001_auditor_labels`, `0003_tasks_engine`.
- Marcador de commit autorizado: `[CORE-APPROVED: ADR-0008]` (válido solo con estado = aceptado).
