# ADR-0022 — `must_set_password` a prueba de balas (columna + middleware)

- **Estado:** aceptado
- **Fecha:** 2026-06-04
- **Decisor:** Nicolas (humano) · **Redactó:** Orquestador · **Insumo:** Agente (auditoría)
- **¿Toca /core?:** SÍ → migración (columna + trigger) + `middleware.ts` + `lib/auth/routing`.
  **Revierte la Opción L de ADR-0020** (layout, no-core). Aprobación humana 2026-06-04. DISCIPLINA REFORZADA.

## Contexto

ADR-0020 puso el flag `must_set_password` en `app_metadata` con intercepción en el **layout** (Opción L,
no-core). En producción (deploy verde, b43cca7) se confirmó la brecha: con `generateLink('recovery')` +
PKCE de `@supabase/ssr`, la sesión puede establecerse client-side (`detectSessionInUrl`) por fuera del
flujo del callback server, dejando una **ventana donde el usuario entra sin pasar por el layout** → usa la
app sin fijar su clave. La Opción L no cierra ese borde.

## Decisión

**Mover el gate a la capa que cubre TODO, sin staleness:**

1. **Columna `public.users.must_set_password boolean not null default false`** — fuente de verdad,
   RLS-protegida. Un **trigger** impide que el usuario la limpie por sí mismo (solo admin/service_role la
   escribe), como `forbid_self_privilege_escalation`. (Se conserva `app_metadata` como respaldo secundario.)
2. **Intercepción en `middleware.ts`** (+ `lib/auth/routing`): si el usuario autenticado tiene
   `must_set_password`, **toda** ruta (páginas y server actions/POST) redirige a `/auth/reset?mode=update`
   hasta que la fije. El middleware lee el flag del servidor (no del JWT) → sin ventana de staleness.
3. **Setear/limpiar:** alta-por-admin y reset-por-admin la fijan (service_role); `changeOwnPassword` /
   set-password la limpian tras `updateUser` ok. Se limpian columna **y** `app_metadata`.
4. **Config Supabase (no-código):** subir el **expiry del OTP/recovery link** (Auth → Email) para mitigar
   `otp_expired` (links de un solo uso que un escáner de correo puede pre-consumir).

## Qué se revierte
- ADR-0020 Opción L (layout) → **Opción M (middleware + columna)**. El layout puede quedar como defensa
  adicional, pero el gate efectivo es el middleware.

## Riesgos
- **[MEDIO]** Lectura del flag en middleware en cada request → hacerlo junto con el rol (1 query) para no
  duplicar coste. El Agente afina.
- **[BAJO]** `/auth/*` no debe auto-bloquearse (la pantalla de set-password vive ahí). Allowlist en el middleware.

## Verificación
- Tests: usuario con `must_set_password` → toda ruta (incl. una server action) redirige a set-password;
  no puede limpiarlo él mismo (trigger); tras fijar clave → columna y app_metadata limpias, acceso normal.
  Build verde. Aplicar la migración en Supabase.

## Endurecimiento tras revisión adversarial (2026-06-09)

Antes de mergear el core se corrió una revisión adversarial (5 lentes + síntesis). 6 huecos reales; resolución:

1. **[CRÍTICO] Trigger confundía «sistema» con «usuario role=null»** — `app_current_role()` es null tanto
   para service_role (sin JWT) como para una cuenta recién creada sin rol → un usuario sin rol podía tocar
   su propio flag. **Fix (core, 0014):** discriminar por `auth.uid() IS NULL` (sistema) y `is distinct from
   'admin'` (trata null como ≠ admin → bloquea al role=null). Test 35 cubre el caso role=null.
2. **[CRÍTICO] 0014 no estaba en `docs/deploy/consolidated.sql`** (vía de deploy) → el header afirmaba
   «idempotente vía consolidado» en falso. **Fix:** portado al consolidado (`add column if not exists` +
   `create or replace trigger`), verificado aplicando 2× sobre PG efímero.
3. **[ALTO] Fail-open del flag en middleware ante error de SELECT** — decisión deliberada: NO se fuerza
   `true` ante error transitorio (expulsaría a TODA la base a `/auth/reset`); el respaldo `app_metadata`
   cubre el flujo PKCE. En operación normal columna y app_metadata son consistentes. Comentario corregido.
4. **[ALTO] 0014 no idempotente por sí sola** — es la **convención del repo** (migraciones crudas planas
   como 0000/0003; la idempotencia la da el consolidado). No se rompe la convención: se resuelve con #2.

**Pendiente NO-CORE (batch atómico, en UN mismo commit para evitar lockout):**
- **[CRÍTICO] La columna debe escribirse al crear/resetear** (`admin.ts`, service_role) y **limpiarse en
  `changeOwnPassword`** (`account.ts`, service_role, **sin swallowear el error** → `ok:false` si falla).
  Hoy solo se toca `app_metadata`. Si la escritura (admin) y el clear (account) no van juntos → lockout del
  usuario legítimo. Por eso el core se mergea inerte (columna nunca escrita = comportamiento idéntico a hoy,
  sin regresión) y el cableado se activa atómico en el commit no-core siguiente.

## Trazabilidad
- Revierte/endurece **ADR-0020**; relaciona ADR-0006 (auth). Core: nueva migración + `middleware.ts` +
  `lib/auth/routing`. Config: expiry del link en Supabase (DEPLOY).
- Revisión adversarial 2026-06-09 (workflow 5 lentes): 6 huecos → 4 resueltos en core/consolidado, 2 en el
  batch no-core atómico documentado arriba.
