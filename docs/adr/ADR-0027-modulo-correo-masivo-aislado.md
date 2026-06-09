# ADR-0027 — Módulo de correo masivo + ingesta (express v1, TOTALMENTE AISLADO)

- **Estado:** aceptado (dirección y producto) · **el esquema técnico lo valida el Agente en preflight antes de mergear core**
- **Fecha:** 2026-06-09
- **Decisor:** Nicolas (humano) · **Redactó:** Orquestador · **Insumo:** Orquestador (análisis CSV + diseño de aislamiento)
- **¿Toca /core?:** SÍ → migración `0018_ms_module.sql` (tablas `ms_*` + RLS propia + columna flag en
  `users` + **helper `ms_enabled()`** + **trigger admin-only del flag**). Preflight del Agente
  ratificado 2026-06-09; el merge del core requiere mi revisión del diff/tests + marcador
  `[CORE-APPROVED: ADR-0027]`. DISCIPLINA REFORZADA (core-guard caído, DEBT-0001).

## Contexto

El cliente necesita **ya**, como "desbare" operativo previo a la v2, que un distribuidor pueda **enviar
correo masivo** (~100 destinatarios) a candidatos de reclutamiento, con plantillas reutilizables e
**ingesta de datasets** (CSV). El alias remitente es **`home-ms-recruitments@pistacore.com`** (alias de
Workspace, NO una cuenta de usuario).

Esto **NO es parte de v1** (control de procesos: tareas/plantillas/métricas). Es un pre-urgente. La v2
traerá una versión mejorada e integrada (licencias por rol auditor/admin/distribuidor, quota, seguridad
ultra). **Por eso la regla rectora de este ADR es el AISLAMIENTO**: si se construye "dentro" del sistema
actual, se rompen las reglas del motor y se genera caos. Se construye **al lado**, compartiendo solo el
shell de la app y el gate de acceso.

CSV analizado (`candidatos 11 am`): 100 filas, 4 columnas `Nombre, Apellido, Correo, Hora`; 100/100 con
email válido a primera vista. La ingesta v1 no necesita nada sofisticado.

## Decisión

### 0. Riesgo rector — aislar también la REPUTACIÓN del correo (no solo el código)
El masivo de reclutamiento NO puede compartir reputación de dominio con `info@pistacore.com`, que envía los
**OTP de login** (ADR-0023). Si Google/Hotmail marcan el masivo como spam, degradan la entrega de los
correos de **autenticación** → reaparecen `otp_expired` por reputación. **Decisión:** el vehículo de envío
masivo va por **servicio transaccional + subdominio dedicado** (ej. `mail.pistacore.com`), separado del
canal transaccional de auth. El alias `home-ms-recruitments@pistacore.com` se mantiene **visible como
remitente**; el detalle SPF/DKIM/DMARC del subdominio lo afina el Agente + Nicolas (config externa).

### 1. Aislamiento en 3 capas (línea dura)
- **Datos:** tablas nuevas con prefijo **`ms_`** (`ms_templates`, `ms_datasets`, `ms_recipients`,
  `ms_campaigns`, `ms_sends`) con **RLS propia** (owner = distribuidor self; admin gestiona el flag, no
  necesita leer contenido en v1). **Cero `ALTER`** a `tasks`, `task_instances`, `templates`, funciones de
  KPI o cualquier objeto del motor v1.
- **Código:** sección de menú nueva, **gateada en el layout** por el flag de acceso (patrón existente, NO
  middleware → no-core). Server actions propias en `lib/ms/*`. **Cero toques a `/core` del motor.**
- **Reputación:** §0.

### 2. Gate de acceso — el admin habilita por-distribuidor
Columna aditiva **`public.users.ms_mailing_enabled boolean not null default false`** (nullable-safe). El
admin la togglea desde el panel admin v1. Sin el flag, la sección no aparece ni responde. *Es el único
punto donde el módulo toca una tabla existente, y es aditivo (no cambia el comportamiento del motor).*

### 3. Ingesta de datos (CSV → preview editable → dataset)
- Importar CSV: detectar cabecera, **mapear columnas** (el usuario confirma cuál es email, cuáles son merge
  fields), **validar emails** (marcar inválidos), deduplicar por email.
- **Preview editable mínimo:** corregir celda, eliminar fila, ver inválidos. Nada más.
- Guardar como **dataset reutilizable** (`ms_datasets` + `ms_recipients`). Se pueden importar más datasets.

### 4. Plantillas de email (CRUD + merge fields)
- Crear, guardar, editar, duplicar, crear varias (`ms_templates`).
- **Merge fields** (`{Nombre}`, `{Apellido}`, etc. según columnas del dataset): una sola plantilla
  personaliza el contenido por fila. Esto **colapsa** "misma a todos" vs "diferentes a diferentes" en un
  único motor (misma plantilla, render por destinatario). Asunto y cuerpo soportan merge.

### 5. Envío masivo
- Selección: un dataset (o subconjunto) + una plantilla → previsualizar render → enviar.
- **Límite v1:** 100 por lote, **sin tope diario** (decisión Nicolas; el subdominio aislado contiene el
  riesgo sobre el auth). Se añade un **throttle técnico** de envío (N/seg) para no chocar con límites del
  proveedor ni disparar filtros — esto NO es quota de producto, es prudencia de envío.
- **Log básico por destinatario** (`ms_sends`): `enviado | falló + motivo`, timestamp. Permite reintentar
  rebotados y saber a quién llegó. SIN tracking de apertura/clicks (eso es v2).

### 6. Documentación para v2 (Nicolas lo pidió explícito)
Este ADR + el preflight del Agente quedan como **base de la v2**. La v2 absorberá el módulo así:
- `users.ms_mailing_enabled` → reemplazado por **licencia/quota por rol** (auditor/admin/distribuidor).
- `throttle técnico` → **quota dura** medida y facturable.
- `log básico` → **tracking completo** (apertura, clicks, rebotes clasificados).
- tablas `ms_*` → revisadas para multi-tenant/jerarquía (JD→vendedor) de la columna vertebral v2.
- El **subdominio + proveedor** ya quedará productivo y reutilizable por v2.

## Qué se borró / simplificó (Mandamiento 2-3)
- **Quota dura / licencias** → fuera de v1 (es v2). En v1 solo flag on/off + throttle técnico.
- **Dos motores de envío** ("misma" vs "diferentes") → **uno solo** con merge fields.
- **Editor de dataset complejo** → solo corregir celda / borrar fila / ver inválidos.
- **Tracking de apertura/clicks** → v2.
- **Que el módulo lea o escriba algo del motor v1** → prohibido por diseño (aislamiento).

## Riesgos
- **[ALTO → mitigado]** Contaminar la reputación que sostiene los OTP de auth → mitigado por §0 (subdominio
  + proveedor separado). Es la razón de ser de la decisión.
- **[MEDIO]** "Sin tope diario" puede quemar la reputación del **subdominio** (no el auth) o chocar con
  límites del proveedor → mitigado por throttle técnico + log de rebotes. Si escala, sube a quota (v2).
- **[MEDIO]** Atomicidad del envío en lote (multi-statement) → estado parcial si falla a media tanda; el
  `ms_sends` por-destinatario permite reanudar. Patrón DEBT-0007.
- **[MEDIO]** Legal/spam: el envío debe ser a contactos legítimos (candidatos que aplicaron), no frío puro.
  Fuera del alcance técnico, pero se documenta como responsabilidad del distribuidor.
- **[BAJO]** Fuga de aislamiento si una migración futura mezcla `ms_*` con el motor → el prefijo y la RLS
  propia lo hacen evidente en review.

## Verificación obligatoria
- El Agente entrega **preflight** (esquema `ms_*`, RLS, proveedor, throttle, riesgos) ANTES de codear core.
- Aislamiento: el módulo NO referencia `tasks`/`task_instances`/funciones KPI; un distribuidor sin
  `ms_mailing_enabled` no ve ni ejecuta nada del módulo; la RLS impide ver datasets/plantillas ajenos.
- Envío: lote ≤100 con throttle; `ms_sends` registra resultado por destinatario; merge fields renderizan.
- Build verde. Migración `ms_*` aplicada en Supabase (Nicolas) + config subdominio/proveedor.

## Actualización tras preflight del Agente (2026-06-09)

El Agente entregó preflight (solo-análisis, cero código) fundamentado en código real. Tres deltas que
ratifico/decido como Orquestador:

1. **[CRÍTICO — verificado] El flag `ms_mailing_enabled` era auto-activable por el distribuidor.**
   `users_update` (policies.sql:56-58) permite `id = auth.uid()`, y `forbid_self_privilege_escalation`
   (0000_init.sql:246-248) solo vigila `role`/`distribution_id` → cualquier columna nueva queda escribible
   por el dueño vía PostgREST. Sin guardia, el módulo entero sería bypasseable.
   **Decisión — Opción A:** trigger **dedicado** `forbid_ms_flag_self_change` sobre `users` (no extender el
   guardián del motor → mantiene `ms_*` desacoplado; cuando v2 absorba el módulo se borra junto con sus
   objetos sin tocar el motor). Es core extra (más allá de "solo la columna") → entra en `0018` bajo
   `[CORE-APPROVED: ADR-0027]`.
   **Condición que añado (riesgo que el Agente no marcó):** el trigger debe **replicar el patrón endurecido
   de ADR-0022 §1 / migración 0014** — discriminar `auth.uid() IS NULL` (sistema/service_role → permitido)
   de `app_current_role() is distinct from 'admin'` (trata role=null como ≠ admin → bloquea al usuario sin
   rol). Sin esto se reintroduce el bug de confundir "sistema" con "usuario role=null". El admin togglea el
   flag con su sesión admin (no service_role); el distribuidor nunca.

2. **[Reputación — ratificado] From `@mail.pistacore.com` + Reply-To al alias.** Verificar la **raíz**
   `pistacore.com` en el proveedor reacoplaría la reputación del masivo al dominio que sostiene los OTP de
   auth → deshace §0. El `From` va por el subdominio (100% de la reputación del masivo aislada ahí); el
   display name carga la marca; las respuestas caen en `home-ms-recruitments@pistacore.com`.

3. **[Producto — NUEVO en v1] Opt-out mínimo + lista de supresión.** El Agente lo marcó como hueco; lo
   **incorporo a v1** porque NO es tracking (eso sigue en v2) y protege justo el activo que todo este ADR
   aísla: sin baja, las quejas de spam queman el **subdominio** que estamos protegiendo, y además cubre
   Habeas Data (Ley 1581 CO). Alcance **mínimo**: (a) footer obligatorio con remitente + link de baja
   one-click con token; (b) tabla `ms_suppressions(email, owner_user_id, reason, created_at)` con su RLS;
   (c) al construir el lote, los emails suprimidos se marcan `skipped` en `ms_sends` y no se envían. Scope
   **por owner** en v1; **global del subdominio** en v2 (documentado). El endpoint de baja es público
   (no-core, sin sesión, valida token). Nada de UI de gestión compleja.

**Ratifico sin cambios** del preflight: Resend sobre el subdominio; `public` + prefijo `ms_` (no schema
aparte) en v1, con "schema off-REST" como hardening v2; snapshot de plantilla en `ms_campaigns`; libro
`ms_sends` con `unique(campaign_id, lower(email))` para idempotencia/reanudación; envío por batch ≤100;
escape de valores de merge; sin `service_role` en v1.

**Supuesto a confirmar por Nicolas:** `home-ms-recruitments@pistacore.com` es un **buzón entregable**
(no un alias muerto) para que el Reply-To funcione.

## Actualización 2 — requisitos de interfaz + modelo (2026-06-09)

Nicolas amplió el alcance funcional y pidió **más autonomía del Agente** para agilizar. Dos cambios de
**modelo** entran a `0018` ANTES del merge (evita migración correctiva); el resto es UI no-core.

1. **Multi-plantilla por lote (reincorpora lo que el ADR había colapsado).** Se requiere asignar **plantillas
   distintas a subconjuntos** de destinatarios (a todos lo mismo · a varios · "a impares según id" · una por
   destinatario). El merge-fields NO lo cubre (cambia valores, no el cuerpo). **Decisión de modelo:** el
   **snapshot del contenido se mueve a `ms_sends`** (`subject_snapshot`, `body_html_snapshot` por
   destinatario = render final congelado). `ms_campaigns.template_id` queda como **plantilla por defecto**
   (provenance) y sus `*_snapshot` pasan a **nullable** (ya no son la fuente única). La asignación
   plantilla→subgrupo se resuelve en el server action (no-core) y se **persiste como el render por fila** en
   `ms_sends` → auditoría exacta de lo enviado a cada quien.
2. **Programar lotes.** `ms_campaigns` gana `scheduled_at timestamptz` y `'scheduled'` al CHECK de `status`.
   El **mecanismo de disparo** del envío diferido (cron/edge + pg_net) lo decide el Agente con su autonomía
   elevada; el modelo ya queda listo.

**Terminología (supuesto declarado):** lo que Nicolas llama "remitentes" en la gestión del lote = los
**destinatarios/recipients** (los que reciben; "asignar a impares según id" se refiere a sus filas). Si
fuera otra cosa, es un ajuste no-core.

**Funciones de interfaz del módulo (todo no-core, autonomía máxima del Agente):** lista de lotes; duplicar
lote; gestión de destinatarios (agregar, duplicar, modificar, eliminar); generar más lotes; programar;
test-send; logs (`ms_sends`); CRUD de plantillas; asignación plantilla→destinatarios (a todos / a varios /
impares por id / una por fila).

## Trazabilidad
- Relaciona ADR-0023 (auth/OTP, reputación de dominio compartida es el riesgo rector), ADR-0022 (patrón
  del trigger admin-only endurecido), DEBT-0007
  (atomicidad bulk), DEBT-0015 (rate-limit). Antecede el módulo de mailing de **v2** (licencias/quota).
- Core: `0018_ms_module.sql` (5+1 tablas `ms_*` incl. `ms_suppressions` + columna flag + `ms_enabled()` +
  trigger `forbid_ms_flag_self_change`). No-core: UI sección + gate en layout + `lib/ms/*` + adaptador
  Resend + endpoint público de baja. Config: subdominio + Resend (externo, Nicolas).
- Marcador (al mergear core): `[CORE-APPROVED: ADR-0027]`.
