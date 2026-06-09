# ADR-0023 — OTP de 6 dígitos en vez de magic-link (alta y recovery)

- **Estado:** aceptado
- **Fecha:** 2026-06-09
- **Decisor:** Nicolas (humano) · **Redactó:** Orquestador · **Insumo:** Agente (diagnóstico v2)
- **¿Toca /core?:** NO (`app/auth/*`, `components/auth/*`, `lib/actions/*`, `lib/email/*` + config Supabase).
  El middleware/routing del gate `must_set_password` NO se tocan.

## Contexto

En producción, el alta-por-admin y el "olvidé contraseña" fallaban siempre con `otp_expired`, y el usuario
no llegaba nunca a la pantalla de set-password. **Dos causas confirmadas:**
1. **PKCE sin `code_verifier`** (Supabase #20937): `admin.generateLink('recovery')` corre server-side; el
   `code_verifier` se crea en el navegador al *iniciar* el flujo. Como el link se generó en el servidor, el
   navegador del usuario no tiene `code_verifier` → `exchangeCodeForSession` **falla aunque el token esté
   fresco**. El magic-link de admin **nunca** podía funcionar. (Explica también el viejo "entra sin clave".)
2. **Pre-consumo por escáner de email** (Supabase #1214): Gmail/Workspace/SafeLinks hacen GET del enlace al
   escanear → consumen el token one-time antes de que el usuario haga clic.

## Decisión

**Migrar de magic-LINK a OTP de 6 dígitos** para alta-por-admin y recovery. Inmune a ambas causas: un
código numérico no es clickeable (nada que pre-consumir) y `verifyOtp` **no usa `code_verifier`**.

- **`generateLink(...).properties.email_otp`** ya devuelve el código (verificado en el SDK). El correo
  branded (nodemailer) lleva **solo el código**, sin enlace clickeable. *Crítico:* `action_link` y
  `email_otp` son el mismo token (uno hasheado) → si se deja el link, el escáner lo consume y mata también
  el código. **Código-only.**
- **App:** pantalla donde el usuario teclea el código → `supabase.auth.verifyOtp({email, token,
  type:'recovery'})` → establece sesión → la siguiente navegación pasa por el middleware → `must_set_password`
  lo fuerza a fijar su clave. (El gate `must_set_password` es independiente del método de entrada; el OTP
  solo hace que la sesión se establezca de forma fiable — por eso nunca se pudo verificar antes.)
- **"Olvidé contraseña"** unifica en un server-action branded (`generateLink('recovery').email_otp` +
  correo propio), no `resetPasswordForEmail` → branding consistente y esquiva el rate-limit de 60s/usuario.
- **OAuth Google** intacto (`/auth/callback` + `exchangeCodeForSession`; su `code_verifier` sí lo pone el
  navegador en `signInWithOAuth`).
- **Config (Nicolas):** Email OTP Expiration generoso (≤24h), longitud 6.

## Qué se descarta / difiere
- Magic-link para alta/recovery → descartado (PKCE roto server-side + escáner).
- Resend/SMTP transaccional → **diferido** (mejora entrega, no la causa; el OTP resuelve el pre-consumo).

## Riesgos
- **[BAJO]** `email_otp` se rellena en runtime (el tipo lo garantiza; validar con log al implementar).
- **[BAJO]** UX: un campo extra (teclear código) vs 1 clic — pero fiable y multi-dispositivo (estándar 2FA).

## Verificación (E2E en vivo — lo que nunca se pudo probar)
- Alta-admin → correo con código → teclear → entra → **forzado a set-password** → fija clave → entra normal.
- "Olvidé contraseña" desde login → código → nueva clave. OAuth Google sigue funcionando.

## Trazabilidad
- Relaciona ADR-0020/0022 (el gate `must_set_password` ahora por fin se ejercita). No-core.
