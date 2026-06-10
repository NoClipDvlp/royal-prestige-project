# ADR-0032 — Imágenes inline en el cuerpo del correo: bucket `ms_assets` + saneamiento HTML

- **Estado:** aceptado · **Fecha:** 2026-06-10
- **Decisor:** Nicolas (humano, OK explícito) · **Redactó:** Orquestador · **Insumo:** Agente (preflight)
- **¿Toca /core?:** SÍ → bucket de Storage + sus policies (SQL en `db/migrations/`). Aprobado
  `[CORE-APPROVED: ADR-0032]`. DISCIPLINA REFORZADA. El **sanitizador HTML** es NO-CORE y se adelanta.

## Contexto

El editor del cuerpo (módulo MS) debe permitir **pegar imágenes** como una firma de Gmail. Hoy el cuerpo se
renderiza con `dangerouslySetInnerHTML` y se envía como email → ya hay **riesgo XSS latente** sin imágenes.

## Decisión

1. **Storage, nunca base64.** La imagen pegada se **sube a Supabase Storage** (bucket `ms_assets`) y se
   inserta como `<img src="url-pública">`. Base64 inline infla el correo y mata la entregabilidad → descartado.
2. **Bucket `ms_assets`:** **público de lectura** (las `<img>` cargan en el cliente de correo, sin sesión).
   Se crea desde la **UI de Storage de Supabase** (1 clic, `Public`). Límites: **≤2 MB**, tipos
   `image/png|jpeg|webp|gif`, nombre **aleatorio** (uuid) + extensión validada **server-side**.

   **ENMIENDA (2026-06-10, OK de Nicolas) — la escritura va por server action con `service_role`, NO por
   RLS de `storage.objects`.** Crear policies sobre `storage.objects` por SQL falla en Supabase con
   `42501: must be owner of table objects` (esa tabla es de `supabase_storage_admin`; ni el SQL Editor es
   owner) y es un dolor recurrente. **Decisión:** la subida pasa por un **server action confinado** (igual
   patrón que el cron de ADR-0029) que valida sesión `authenticated` + tamaño/tipo, **fija el path
   `{session.user.id}/{uuid}.ext` en el servidor** (el cliente no puede escribir en carpeta ajena), y sube
   con `service_role` (que bypassa la RLS de storage). **Cero policies de `storage.objects`** → desaparece
   el error de ownership. El `service_role` queda en un módulo server-only, no un helper global. Es una
   acción **ocasional y validada** (componer plantilla), no la acción más frecuente → superficie aceptable.
   La migración `0020` se reduce al bucket; las policies de `storage.objects` se eliminan.
3. **Saneamiento HTML allowlist (NO-CORE, se adelanta — cierra el XSS latente actual):** allowlist de tags
   (`p,br,strong,em,u,a,ul,ol,li,h1–h3,img,span,div`); `img[src]` **solo** del bucket; `a[href]` solo
   `http(s)`; **prohibido** `script/style/iframe/on*/javascript:`. Sanitizar **al guardar** (server action)
   **y al renderizar** preview. `lib/ms/sanitize.ts` puro, sin deps.

## Qué se borró / acotó
- Base64 inline → descartado (entregabilidad). Edición de imagen (crop/resize) → fuera de v1. Tope de assets
  por owner → DEBT.

## Riesgos
- **[ALTO] XSS** vía HTML pegado → mitigado por el sanitizador allowlist (al guardar y al render); es la pieza
  más crítica y se adelanta independiente del bucket.
- **[MEDIO]** Bucket público → con la URL exacta se ve la imagen; paths con uuid aleatorio no son enumerables.
  Aceptable para imágenes de correo (estándar). No subir contenido sensible.
- **[BAJO]** Abuso de subida (espacio) → límite de tamaño/tipo server-side; cuota por owner = DEBT.

## Verificación
- Tests: subir imagen → `<img>` con URL del bucket; pegar `<script>`/`onerror`/`javascript:` → removido por
  el sanitizador (guardar y render); archivo >2 MB o tipo inválido → rechazado server-side; un owner no
  escribe en el path de otro (RLS). Build verde + harness del bucket.

## Trazabilidad
- Relaciona ADR-0027 (módulo MS). Core: bucket `ms_assets` + policies de Storage. No-core: `lib/ms/sanitize.ts`
  + paste-to-upload en el editor. Marcador: `[CORE-APPROVED: ADR-0032]`.
