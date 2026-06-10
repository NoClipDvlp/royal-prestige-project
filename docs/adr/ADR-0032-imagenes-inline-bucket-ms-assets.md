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
2. **Bucket `ms_assets` (core):** **público de lectura** (las `<img>` cargan en el cliente de correo, sin
   sesión), **escritura RLS por owner** (path `ms_assets/{owner_uid}/...`; insert/update/delete con
   `owner = auth.uid()`; **sin service_role**). Límites: **≤2 MB**, tipos `image/png|jpeg|webp|gif`, nombre
   **aleatorio** (uuid) + extensión validada **server-side** (no confiar en el cliente).
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
