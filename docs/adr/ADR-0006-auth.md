# ADR-0006 — Autenticación y sesión (Supabase Auth + SSR)

- **Estado:** aceptado
- **Fecha:** 2026-06-02
- **Decisor:** Nicolas (humano) — autoridad final
- **Redactó:** Orquestador (Claude Cowork)
- **Insumo técnico de:** Agente (Claude Code) — diseño solo-análisis
- **¿Toca /core?:** SÍ → `middleware.ts`, `lib/auth/**`, `db/migrations/0002_auth_profile.sql`.
  Aprobación humana: 2026-06-02 (Nicolas, vía Orquestador). Ejecución con **DISCIPLINA REFORZADA**
  (core-guard caído por billing, DEBT-0001 ítem 1).

## Contexto

El MVP necesita su capa de auth (SPEC §5/§6) sobre Supabase Auth + Next 16 App Router. Es la
puerta del sistema: el riesgo no es "hacerlo funcionar" sino hacerlo SEGURO. El schema ya nació
preparado (`users.id = auth.users.id`, `auth_providers[]`, `role` nullable, helpers
`auth.current_role()`, self-policy y bloqueo de `role=null`). El gate REAL de datos es la RLS;
auth añade la sesión, el routing y el onboarding.

## Decisiones de producto resueltas (autoridad: Nicolas, 2026-06-02)

1. **Email = identificador obligatorio.** Google es 2º método vinculable; teléfono es solo campo de
   perfil (no auth), sin OTP. Razón dura: el reset de contraseña es por email (SPEC §5) → sin email
   no hay recuperación de cuenta.
2. **Confirmación de email obligatoria** + **vinculación de identidades MANUAL** (`linkIdentity`),
   nunca auto-link silencioso por mismo-email → cierra la toma de cuenta por identity-linking.
3. **Datos de distribución en signup = metadato de solicitud.** El distribuidor deja su `full_name`
   + nombre de distribución deseado como metadato (`raw_user_meta_data`); el admin lo revisa, crea
   la `distribution` y asigna. El **logo NO se captura en signup** (requiere Storage, diferido); lo
   configura el admin/distribuidor tras la asignación.

## Decisiones técnicas (el CÓMO — Orquestador con insumo del Agente)

4. **Perfil creado por trigger DB `handle_new_user`** (`AFTER INSERT on auth.users`, SECURITY
   DEFINER, `search_path=''`): inserta `public.users` con `role=null`, `distribution_id=null`
   (cumple el CHECK), copia `full_name` y guarda la distribución deseada en `users.preferences`
   (jsonb; sin tocar el schema de columnas). Atómico con el signup → sin orfandad de perfil. Cubre
   email/password y Google por igual. **Se eligió sobre server-action** por la orfandad (un perfil
   que no se crea deja al usuario en estado roto, sin ni su fila para "contacta admin").
5. **`auth_providers` sincronizado por trigger** en `auth.identities` (`AFTER INSERT/DELETE`):
   recalcula el array al vincular/desvincular.
6. **`middleware.ts`**: `@supabase/ssr` `createServerClient` con cookies de `next/headers`; refresca
   sesión por request. **Usa `auth.getUser()` (valida el JWT contra Supabase), NUNCA `getSession()`**
   para autorización (getSession lee la cookie → falsificable; es el footgun #1 de Supabase-SSR).
   Routing: sin-auth → `/login`; auth+`role=null` → solo `/sin-rol`; auth+rol → app. Cookies
   httpOnly + secure + sameSite=lax. **Rol para routing = query a `users.role` por request** (no
   claim-hook en MVP; la RLS ya da inmediatez a los datos).
7. **`lib/auth/**`**: server client, `getUser()` validado, `getProfile()→{role,distribution_id}`,
   `requireAuth()`/`requireRole()` para Server Components y Actions. **Toda server action con
   `service_role` (reset admin, alta) re-verifica `getUser()` + rol ANTES** (service_role bypassa RLS).
8. **`role=null`** → middleware enruta a `/sin-rol`; la pantalla no consulta negocio (a lo sumo su
   propia fila vía self-policy, para el saludo). **Sin edición de perfil** (SPEC §5: "nada más").
   Defensa en profundidad: aunque navegue a `/dashboard`, el middleware redirige Y la RLS devuelve 0.
9. **Reset de contraseña:** usuario vía `resetPasswordForEmail` → `/reset-password`; admin vía
   `service_role` (`auth.admin`) **gateado por `getUser()`+rol=admin**. **Sesiones múltiples permitidas**
   (no activar single-session en Supabase).

## Qué se borró / simplificó

- Registro phone-only: descartado (sin email no hay reset).
- Auto-link de identidades por mismo-email: descartado (vector de toma de cuenta).
- Logo de distribución en signup: diferido (evita Storage en el flujo de auth).
- Claim-hook de rol en JWT: diferido (query por request basta en MVP).
- Edición de perfil para `role=null`: fuera (SPEC literal).

## Riesgos de seguridad (insumo del Agente)

- **[ALTO] `getSession()` para authz** → sesión falsificable. **Mandatorio `getUser()`.**
- **[ALTO] Toma de cuenta por identity-linking** sin email confirmado → mitiga: confirmación + link manual.
- **[ALTO] `service_role` en server actions sin re-checar rol** → bypass total de RLS → mitiga: gate getUser()+rol.
- **[MEDIO] Trigger en schema `auth`** (gestionado por Supabase): patrón soportado; SECURITY DEFINER + `search_path=''`, no abortar el signup por errores recuperables.
- **[MEDIO] Orfandad de perfil**: mitigada por el trigger (Opción A). El caso residual se trata como `role=null`.
- **[BAJO] Realtime/Storage** tras login deben seguir la misma RLS/políticas (ya identificado; se verifica en su hito).

## Verificación obligatoria (tests — extienden la suite; lo que el shim no cubra se declara)

- Signup email/password y Google → perfil `public.users` creado con `role=null` (trigger). Demostrable con shim.
- `role=null` → 0 filas en toda tabla de negocio; solo su fila en `users` (sin regresión de RLS).
- `auth_providers` refleja `{password}` y `{password,google}` tras link (trigger). Demostrable con shim.
- `service_role` en server action sin rol=admin → rechazado por el gate (test de la lógica del guard de la action).
- `getUser()` (no `getSession()`) en middleware y guards: verificación de código + (si es testeable) de integración.
- Email sin confirmar no opera: verificación con el setting de Supabase (puede quedar como check manual).

## Archivos core que toca la escritura

`middleware.ts`, `lib/auth/**`, `db/migrations/0002_auth_profile.sql` (triggers `handle_new_user` +
sync de `auth_providers`). **NO toca `users_select` ni `users_labels`** → DEBT-0004 intacta (el
trigger es aditivo). No-core: `app/(auth)/{login,signup}`, `app/sin-rol`, `app/auth/callback`,
`app/reset-password`, `lib/supabase/server.ts`. Dependencia nueva: `@supabase/ssr` (versión exacta
en el pre-flight).

## Trazabilidad

- Relaciona: `ADR-0001`, `ADR-0003`, `ADR-0005`, `docs/PROJECT_SPEC.md` §5/§6, `docs/DATA_MODEL.md`
- Cierra: pantalla de onboarding (SPEC §5). Habilita: features con datos reales.
- Marcador de commit autorizado: `[CORE-APPROVED: ADR-0006]` (válido solo con estado = aceptado).
