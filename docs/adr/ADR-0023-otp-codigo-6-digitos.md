# ADR-0023 — Auth por CÓDIGO OTP de 6 dígitos (en vez de magic-link)

- **Estado:** aceptado
- **Fecha:** 2026-06-09
- **Decisor:** Nicolas (humano) · **Redactó:** Orquestador · **Insumo:** Agente (re-diagnóstico v2 + workflow de verificación)
- **¿Toca /core?:** NO. `app/auth/*`, `components/auth/*`, `lib/actions/*`, `lib/email/*` (ninguno en `.coreignore`).
  El middleware/routing (core) NO se tocan: el gate `must_set_password` ya opera post-sesión (ADR-0022).

## Contexto

Con el deploy verde en `996ca17` (todos los hotfixes de ADR-0022 en prod), **alta-por-admin + recovery +
set-password seguían rotos** con `otp_expired`. Re-diagnóstico v2 (workflow de verificación web + lectura de
código + tipos del SDK instalado) confirma **dos causas raíz que se combinan**:

1. **Pre-consumo por escáner de correo** *(Supabase issue #1214; SafeLinks/Defender/Barracuda/Gmail)*: el
   escáner hace GET del enlace al revisar el correo → **consume el token one-time ANTES** del clic → el
   usuario abre un link ya gastado → `otp_expired`.
2. **PKCE sin `code_verifier`** *(supabase #20937, auth-js #767)*: `@supabase/ssr` usa PKCE, que exige un
   `code_verifier` (cookie) creado en el **navegador** al iniciar el flujo. `admin.generateLink('recovery')`
   corre en el **servidor** → no hay `code_verifier` en el navegador que abre el link → `exchangeCodeForSession`
   falla **aunque el token estuviera fresco**.

SMTP Gmail personal **agrava** (cola/retraso vs expiry, rate-limit ~60s) pero no es la causa; cambiar a
transaccional mejora la entrega pero **no** elimina el pre-consumo.

## Decisión

**Migrar de magic-LINK a CÓDIGO OTP de 6 dígitos + `verifyOtp`.**

- Un código numérico **no es clicable** → el escáner no tiene nada que pre-consumir (resuelve #1).
- `supabase.auth.verifyOtp({ email, token, type:'recovery' })` establece sesión a partir del código **sin
  `code_verifier` ni `exchangeCodeForSession`** (resuelve #2). Verificado en docs y en el SDK instalado:
  `GenerateLinkProperties.email_otp: string` — *"The raw email OTP. You should send this in the email if you
  want your users to verify using an OTP instead of the action link."*
- **Alta-por-admin y reset-por-admin**: `generateLink('recovery')` → se usa `properties.email_otp` (NO el
  `action_link`) en el correo branded. Un log confirma `email_otp` en runtime.
- **"Olvidé contraseña"** (desde login): unificado en `requestPasswordOtp` (server-action branded, service_role
  → **esquiva el rate-limit de 60s/usuario** y **no depende de plantillas de Supabase**). No revela existencia.
- **Correo CÓDIGO-ONLY**: sin enlace de verificación. `action_link` y `email_otp` comparten el mismo token;
  incluir el link permitiría al escáner consumir el token y **matar también el código**. El correo lleva el
  código + una URL **normal** de la app (`/auth/reset?mode=otp&email=…`, sin token) para abrir la pantalla.
- **Pantalla** `/auth/reset?mode=otp`: email + código de 6 dígitos + nueva contraseña → `verifyOtp` →
  `changeOwnPassword` (fija clave + limpia `must_set_password` + aviso). El gate de ADR-0022 sigue forzando
  el set-password si el usuario navega sin fijarla.
- **OAuth Google intacto**: sigue por `/auth/callback` + `exchangeCodeForSession` (su `code_verifier` sí lo
  pone el navegador en `signInWithOAuth`).

## Trade-off

- **Link:** 1 clic, cero tecleo — pero **roto** (pre-consumo + PKCE).
- **OTP:** un campo extra (teclear 6 dígitos) pero **fiable** y **multi-dispositivo** (pide en un dispositivo,
  entra en otro), estándar tipo 2FA. **Neto: aceptado.**

## Config (Nicolas, Supabase) y deuda
- Email OTP Expiration generoso (máx 86400s/24h) — Auth → Providers → Email. Longitud 6 (default).
- **Resend/transaccional DIFERIDO** (DEBT): mejora *entrega* (Gmail personal va a spam, rate-limit), **no** el
  pre-consumo (eso lo resuelve el OTP). Hacer al configurar DNS de pistacore.

## Verificación
- Build + typecheck verdes. Log de `email_otp` en runtime al crear/resetear/forgot.
- A probar EN VIVO (por fin posible, el link fallaba antes): alta → correo con código → `mode=otp` → entra →
  el gate fuerza set-password → queda dentro. Recovery por "olvidé contraseña" idem.

## Trazabilidad
- Complementa **ADR-0022** (gate `must_set_password`); relaciona ADR-0020/ADR-0006 (auth). No-core.
- Suposición marcada validada: `properties.email_otp` existe en el SDK `@supabase/auth-js` instalado.
