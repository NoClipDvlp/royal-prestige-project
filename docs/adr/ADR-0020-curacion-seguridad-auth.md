# ADR-0020 — Curación de seguridad de auth (set-password forzado, reset, sesiones, correos)

- **Estado:** aceptado
- **Fecha:** 2026-06-04
- **Decisor:** Nicolas (humano) · **Redactó:** Orquestador · **Insumo:** Agente (auditoría solo-lectura)
- **¿Toca /core?:** NO (Opción L: intercepción en el layout, flag en `app_metadata`, sin schema ni
  middleware). Decisión de seguridad registrada por su importancia aunque sea no-core.

## Contexto

Auditoría de seguridad (QA). La postura base es sólida (service_role gateado por `assertCallerIsAdmin`,
`getUser` para authz, RLS `FORCE` en todas las tablas, secretos server-only). Pero hay brechas en el
flujo de credenciales que Nicolas detectó: el link de recovery **crea sesión antes de fijar la clave**,
así que un usuario puede quedar logueado sin haber establecido su contraseña.

## Decisión

### 1. B3 — `signOut` local (CRÍTICA, fix de 1 línea)
`adminDeleteUser` re-autentica al admin con un probe client y luego `probe.auth.signOut()` con scope
**global** → revoca todos los refresh tokens del admin → lo desloguea. Fix: `signOut({ scope: "local" })`.

### 2. `must_set_password` — forzar establecer clave (recupera el "#4" eliminado por error)
- **Flag** en `app_metadata.must_set_password` (Supabase) — **tamper-resistant** (`app_metadata` solo lo
  escribe service_role/admin API; el usuario no puede limpiarlo, a diferencia de `user_metadata`).
- Se **fija** (service_role) en: alta-por-admin y reset-por-admin. Se **limpia** cuando el usuario fija
  su clave (server action con service_role tras `updateUser` ok) + `refreshSession()` (evita bucle por JWT viejo).
- **Intercepción — Opción L (no-core):** `redirect` en el layout `(app)` (server): si `must_set_password`
  → `/auth/set-password`. La página de set-password vive en `/auth/*` (no se auto-bloquea). Resiste
  manipulación porque el flag está en `app_metadata` (no escribible por el cliente) y se lee del `getUser`
  validado en server. *(Es gate de UX/onboarding; la autorización real la da el rol+RLS, no el flag.)*

### 3. Reset por admin — invalidación DURA (Nicolas, 2026-06-04)
`adminResetPassword` cambia la clave a una **aleatoria** (la vieja deja de funcionar) + `must_set_password`
+ correo branded con link de recovery. Unifica el flujo con el alta-por-admin. **No hay lockout
permanente:** si el link caduca, el usuario usa "olvidé mi contraseña" (self-recovery existente). Se
descarta "la vieja autentica pero fuerza cambio" — Nicolas pidió que la antigua no acceda.

### 4. Correos de onboarding — sin doble correo
Parámetro `notify` en `assignUserRole`:
- Alta-por-admin (camino A): `notify:false` (ya mandó su bienvenida con link).
- Primera asignación a auto-registrado (camino B): `notify:true`, `role: null→X` → **bienvenida sin link**
  (ya tiene clave): felicitaciones + rol + accesos.
- Re-asignación / cambio de rol: correo **"tu rol cambió"** (suave).
- Signup sin rol → correo **"cuenta en revisión"**.

### 5. Endurecimientos
- Borrar tarea desde la UI (con confirmación), **con scope** en recurrentes (este día = `excluded_dates`;
  toda la serie = soft-delete), un solo "Eliminar" en `once`.
- Email duplicado: mensaje claro en alta-admin y signup (enumeración leve aceptada por decisión de producto).
- Aviso "tu contraseña cambió" tras `updateUser({password})` (vía server action, mailer server-only).
- `/auth/callback`: `next` restringido a allowlist de rutas internas.
- **Diferido (deuda):** rate-limit propio en `adminCreateUser`/recovery (B10) — bajo riesgo (admin-gated + GoTrue).

## Qué se borró / simplificó
- Opción M (middleware, core) para la intercepción → descartada: L (layout) es suficiente (el flag es
  gate de UX, no de autorización).

## Riesgos
- **[MEDIO → mitigado]** Usuario logueado sin clave fijada → `must_set_password` + intercepción layout lo fuerza.
- **[BAJO]** Server action directo saltándose el layout → no escala (rol+RLS gobiernan los datos). Si surge
  vector real, escalar a Opción M con ADR.

## Verificación
- Eliminar usuario NO desloguea al admin; alta/reset dejan al usuario forzado a set-password antes de usar la
  app; la clave vieja no autentica tras reset; correos sin duplicar (camino A no manda doble); build verde.

## Trazabilidad
- Relaciona ADR-0006 (auth), ADR-0009 (panel admin). No-core: `lib/actions/admin.ts`, `lib/auth` (server,
  no middleware), `lib/email/mailer.ts`, layout `(app)`, `/auth/set-password`.
