# TECH DEBT — Royal Control

> Registro de deuda técnica asumida conscientemente. Una entrada = una deuda con
> condición de salida explícita. Si una deuda no tiene criterio de cierre, no es deuda:
> es un bug sin dueño. El Orquestador mantiene este archivo; cerrar una deuda puede
> requerir ADR si la resolución toca arquitectura o `/core`.
>
> ✅ **Validado en Supabase real (E2E parcial, 2026-06-03):** el trigger `handle_new_user`, la RLS self,
> el `middleware` (getUser), el signup y las tareas reales (alta + estado + edición de recurrentes)
> funcionan end-to-end. Lo pendiente para el E2E completo es **config/infra** (DEBT-0006 deploy + SMTP/
> OAuth, DEBT-0009), no lógica de producto. (DEBT-0008 SMTP/email cerrada por el flujo de alta con enlace.)

---

## DEBT-0001 — Enforcement de core-guard inoperante

- **Estado:** parcialmente cerrada — ítems 2 y 3 CERRADOS por ADR-0004; queda abierto solo el ítem 1 (billing)
- **Fecha de registro:** 2026-06-02
- **Decisor (asumir como deuda):** Nicolas (humano)
- **Registró:** Orquestador (Claude Cowork)
- **Severidad global:** alta — el control de seguridad central del proyecto no se aplica.

### Contexto

Se activó el repo en git con remoto y el workflow `core-guard.yml`, pero el enforcement
físico de `/core` **no está operando**. Se decide avanzar producto y dejar el blindaje de
CI como deuda consciente hasta resolver el bloqueo de billing. Durante esta ventana, la
protección de `/core` opera en **modo papel**: solo la disciplina de proceso impide tocar
el núcleo; nada físico lo frena.

### Ítems

| # | Ítem | Severidad | DRI | Condición de salida |
|---|---|---|---|---|
| 1 | Billing de GitHub Actions bloqueado (`account is locked`) → core-guard no corre en ningún evento | Alta | Nicolas | Desbloquear billing en cuenta/org NoClipDvlp → el check arranca |
| 2 | ✅ **CERRADO (ADR-0004)** — el `push`-trigger daba falso positivo en branches nuevos | Media | Agente | Hecho: `push: branches: ['**']` → `[main]` |
| 3 | ✅ **CERRADO (ADR-0004)** — `core-guard.yml` no se autoprotegía | Media | Nicolas | Hecho: workflow añadido a `.coreignore` (commit `[CORE-APPROVED: ADR-0004]`) |

### Impacto mientras la deuda esté abierta

- Cualquier cambio a `/core` (schema, RLS, auth, rbac) **no es bloqueado físicamente**.
  Riesgo latente de filtración de datos entre distribuciones si un cambio mal hecho a RLS
  entra sin que nadie lo note. Mitigación temporal: ningún handoff puede tocar `/core` sin
  aprobación explícita de Nicolas (regla de proceso, no de CI).
- Score del estado de gobernanza con esta deuda abierta: **3.5 / 5.0**.

### Criterio de cierre de la deuda completa

Ítems 2 y 3 cerrados por ADR-0004 (trigger arreglado + workflow autoprotegido en `.coreignore`).
Queda **solo el ítem 1 (billing)**: al desbloquearse, `core-guard` correrá y pasará en verde sobre
un PR real → ahí DEBT-0001 cierra completa y el score de gobernanza vuelve a ≥4.6.

### Trazabilidad

- Relaciona: `ADR-0001`, `.ai/core/CORE_MANIFEST.md`, `.github/workflows/core-guard.yml`
- PR afectado: #1 (`chore: .gitignore + blindaje de secretos`, cerrado como superado por el Hito 0)

---

## DEBT-0002 — `.coreignore` protege `next.config.mjs` pero no `next.config.ts|js`

- **Estado:** ✅ CERRADA (ADR-0004, 2026-06-02) — `next.config.*` añadido a `.coreignore`
- **Fecha de registro:** 2026-06-02
- **Decisor (asumir como deuda):** Nicolas (humano)
- **Registró:** Orquestador (Claude Cowork)
- **Severidad global:** media — hueco de evasión del guard de core.

### Contexto
`.coreignore` protege la ruta exacta `next.config.mjs`. Next admite también `next.config.ts`
y `next.config.js`. Un rename del archivo de config esquivaría `core-guard` sin marcador
`[CORE-APPROVED]`. Detectado por el Agente durante el Hito 0 (ver ADR-0002).

### Condición de salida
Añadir `next.config.*` a `.coreignore`. Editar `.coreignore` está bajo `.ai/` → es core:
requiere ADR + aprobación de Nicolas + commit `[CORE-APPROVED]`. Se agrupa con DEBT-0001
ítem 3 (autoprotección del guard) para no abrir el flujo de core dos veces por temas afines.

### Trazabilidad
- Relaciona: `ADR-0002`, `.ai/core/.coreignore`, `.github/workflows/core-guard.yml`, `DEBT-0001`

---

## DEBT-0003 — El guard solo protege migraciones 0000_*, no las futuras (0001+)

- **Estado:** ✅ CERRADA (ADR-0004, 2026-06-02) — `.coreignore` ampliado a `db/migrations/`
- **Fecha de registro:** 2026-06-02
- **Decisor (asumir como deuda):** Nicolas (humano)
- **Registró:** Orquestador (Claude Cowork)
- **Severidad global:** media-alta — los cambios futuros de schema vía migraciones escapan al guard.

### Contexto
`.coreignore` protege `db/migrations/0000_*` (glob). Las migraciones siguientes (`0001+`),
donde vivirán los cambios evolutivos del schema, NO están cubiertas. La RLS del Hito 2 se
ubicó en `lib/rls-policies/` (sí protegida) justo por esto, pero el schema futuro queda expuesto.

### Condición de salida
Ampliar `.coreignore` a `db/migrations/` (directorio completo). Editar `.coreignore` = core →
ADR + aprobación de Nicolas + `[CORE-APPROVED]`. Agrupar con DEBT-0001 ítem 3 y DEBT-0002 en
un único ADR de cobertura del guard.

### Trazabilidad
- Relaciona: `ADR-0003`, `.ai/core/.coreignore`, `DEBT-0001`, `DEBT-0002`

---

## DEBT-0004 — Auditor lee la fila completa de `users` (PII), no solo labels

- **Estado:** ✅ CERRADA (ADR-0005, 2026-06-02) — auditor usa la vista `users_labels`; sin SELECT sobre `users` cruda
- **Fecha de registro:** 2026-06-02
- **Decisor (asumir como deuda):** Nicolas (humano)
- **Registró:** Orquestador (Claude Cowork)
- **Severidad global:** media — exceso de columnas (PII) para el rol auditor; NO es leak entre distribuciones.

### Contexto
`users_select` (lib/rls-policies/policies.sql) da al auditor SELECT de la fila completa de
`users` (email, phone, preferences, auth_providers). La RLS filtra por fila, no por columna.
Para el ranking el auditor solo necesita `full_name` + `distribution_id`. Decisión de Nicolas
(2026-06-02): restringir a labels.

### Condición de salida
Crear una vista de labels (`full_name` + `distribution_id`) o column-grants, reapuntar el
acceso del auditor a esa vista y quitarle el SELECT sobre la tabla `users` cruda. Toca
`lib/rls-policies/` (core) → ADR + `[CORE-APPROVED]`. Hacer ANTES de que haya datos reales (hito de auth).

### Trazabilidad
- Relaciona: `ADR-0003`, `lib/rls-policies/policies.sql`, `docs/DATA_MODEL.md`, `DEBT-0001`

---

## DEBT-0005 — Repo en drive sincronizado (iCloud/Dropbox) — riesgo de corrupción de `.git`

- **Estado:** ✅ CERRADA (2026-06-03) — repo re-clonado a una ruta local NO sincronizada (`~/dev/royal-control`, fuera de iCloud). Condición de salida cumplida.
- **Fecha de registro:** 2026-06-02
- **Decisor (asumir como deuda):** Nicolas (humano) — decidió dejarlo y asumir el riesgo.
- **Registró:** Orquestador (Claude Cowork)
- **Severidad global:** alta — incidente materializado (logo casi perdido); riesgo de corrupción de `.git`.

### Contexto
El repo vive en una carpeta sincronizada. Ha causado: `index.lock` huérfano, `tsconfig` fantasma,
duplicados `.d 2.ts`, y el logo guardado como `:royal-prestige-logo.png` (recuperado del object-store
de git). Un repo git en sync puede corromper `.git` en una race, potencialmente irrecuperable en local.

### Mitigación activa (obligatoria mientras la deuda esté abierta)
Push a `origin` DESPUÉS DE CADA HITO, sin excepción → `origin` es la verdad recuperable; si el sync
corrompe el local, se re-clona. El working tree local se trata como desechable.

### Condición de salida
~~Mover / re-clonar el repo a una ruta local NO sincronizada.~~ ✅ Hecho (2026-06-03): re-clone a `~/dev/royal-control`, fuera del drive sincronizado. La mitigación de "push tras cada hito" deja de ser obligatoria por este motivo (sigue siendo buena práctica).

### Trazabilidad
- Incidentes en Hitos 0–3. Relaciona: `DEBT-0001`, `ADR-0011` (cerrada en el handoff del hito Tareas premium)

---

## DEBT-0006 — Falta proyecto Supabase real + habilitar pg_cron (job de materialización)

- **Estado:** abierta
- **Fecha de registro:** 2026-06-02
- **Decisor (asumir como deuda):** Nicolas (humano)
- **Registró:** Orquestador (Claude Cowork)
- **Severidad global:** media-alta — sin esto, el motor de tareas no genera instancias en producción.

### Contexto
El motor de tareas (ADR-0007) materializa las `task_instances` diarias con un job **pg_cron**
(`materialize_day(app_today())`). En el harness de tests no hay pg_cron: el `cron.schedule` queda
GUARDADO (`if exists pg_extension`) y `materialize_day()` se prueba llamándola directamente. Para que
el job corra de verdad hace falta un **proyecto Supabase desplegado** con las migraciones `0000–0003`
aplicadas y **pg_cron habilitado**. Además, sin proyecto real tampoco funcionan los flujos de auth
end-to-end (login/signup/OAuth/confirmación de email — ver hito Auth).

### Condición de salida
Crear/conectar el proyecto Supabase, aplicar migraciones `0000–0003`, habilitar la extensión `pg_cron`
y verificar que el schedule diario corre (instancias de hoy creadas). Configurar también env reales,
Google OAuth y la confirmación de email obligatoria.

### Trazabilidad
- Relaciona: `ADR-0006`, `ADR-0007`, `db/migrations/0003_tasks_engine.sql`, `DEBT-0001`, `DEBT-0005`

---

## DEBT-0007 — Edición de recurrentes "este y siguientes" / "este día futuro" no es atómica

- **Estado:** abierta
- **Fecha de registro:** 2026-06-02
- **Decisor (asumir como deuda):** Nicolas (humano)
- **Registró:** Orquestador (Claude Cowork)
- **Severidad global:** media-baja — estado recuperable; fallo raro.

### Contexto
`updateTask` con scope `this_and_following` (UPDATE `recurrence_until` + INSERT nueva serie) y
`this_day` futuro (`excluded_dates += D` + INSERT task `once`) corren como sentencias secuenciales
en la server action (Supabase JS no envuelve multi-statement en transacción). Si falla a mitad,
queda estado parcial (recuperable reintentando). La atomicidad real requiere un RPC postgres
(SECURITY DEFINER) = core.

### Condición de salida
Mover el split/exclude a un RPC atómico en `db/migrations/` (core → ADR + `[CORE-APPROVED]`).
Post-MVP salvo que se observe inconsistencia.

### Trazabilidad
- Relaciona: `ADR-0007`, `lib/actions/tasks.ts`, `DEBT-0001`

---

## DEBT-0008 — SMTP propio pendiente (confirmación de email + reset de contraseña)

- **Estado:** ✅ CERRADA (2026-06-09) — el flujo de email quedó implementado: el alta de usuario (#3) envía
  un **correo con enlace** para fijar contraseña (sin credencial en texto plano), vía `nodemailer` +
  Workspace SMTP (`lib/email/mailer.ts`), y el **custom SMTP de Supabase** (recovery #2) está documentado en
  `docs/DEPLOY.md §5/§6`. La **configuración** de las credenciales SMTP es paso de deploy (DEBT-0006).
  Sustituye el workaround de contraseña temporal en texto (eliminado en `adminCreateUser`).
- **Fecha de registro:** 2026-06-03
- **Decisor (asumir como deuda):** Nicolas (humano)
- **Registró:** Orquestador (Claude Cowork)
- **Severidad global:** media-alta — sin email fiable, el signup (confirmación obligatoria, ADR-0006) y el reset de contraseña no operan de forma confiable en producción.

### Contexto
La confirmación de email obligatoria (ADR-0006) y el reset de contraseña dependen del envío de email.
El SMTP por defecto de Supabase es de cortesía (rate-limited, no apto para producción). Detectado en la validación E2E.

### Condición de salida
Configurar un SMTP propio (Resend / SendGrid / similar) en Supabase → Auth → SMTP Settings, con dominio verificado. Config de infra; no toca código.

### Trazabilidad
- Relaciona: `ADR-0006`, `docs/DEPLOY.md`, `DEBT-0006`

---

## DEBT-0009 — Google OAuth consent screen sin configurar

- **Estado:** abierta
- **Fecha de registro:** 2026-06-03
- **Decisor (asumir como deuda):** Nicolas (humano)
- **Registró:** Orquestador (Claude Cowork)
- **Severidad global:** media — "Continuar con Google" falla hasta configurar la consent screen.

### Contexto
El login con Google da error hasta configurar/publicar la **OAuth consent screen** en Google Cloud (o,
en modo *testing*, añadir los emails como usuarios de prueba). Detectado en la validación E2E.

### Condición de salida
Configurar la OAuth consent screen en Google Cloud (scopes + dominio) y publicarla, o añadir test users
mientras esté en testing. Config de infra.

### Trazabilidad
- Relaciona: `ADR-0006`, `docs/DEPLOY.md`, `DEBT-0006`

---

## DEBT-0010 — `forbid_self_privilege_escalation` bloquea operaciones de SISTEMA

- **Estado:** abierta
- **Fecha de registro:** 2026-06-03
- **Decisor (asumir como deuda):** Nicolas (humano)
- **Registró:** Orquestador (Claude Cowork)
- **Severidad global:** media — mejora de core; hay workaround. Afecta el bootstrap (asignar el primer admin).

### Contexto
El trigger `forbid_self_privilege_escalation` (`0000_init`) bloquea cambiar `role`/`distribution_id`
cuando `public.app_current_role()` ≠ `admin`. Pero en operaciones de **SISTEMA** —SQL directo en el editor
o `service_role`— `auth.uid()` es null → `app_current_role()` es null (≠ admin) → el trigger **también**
bloquea esas operaciones legítimas (p.ej. el `UPDATE ... role='admin'` del primer admin en DEPLOY.md §7,
o un proceso server con service_role). No solo bloquea a usuarios-app no-admin, que era la intención.

### Condición de salida
Mejorar el trigger para distinguir **usuario-app** de **sistema** (p.ej. permitir cuando `auth.uid()` es
null = no hay sesión de app). Toca `0000_init` (core) → ADR posterior + `[CORE-APPROVED]`.
**Workaround actual (bootstrap):** desactivar/reactivar el trigger alrededor de la asignación —
`alter table public.users disable trigger trg_users_no_priv_esc;` → `update ... set role='admin' ...` →
`alter table public.users enable trigger trg_users_no_priv_esc;`.

### Trazabilidad
- Relaciona: `ADR-0003`, `db/migrations/0000_init.sql`, `docs/DEPLOY.md`, `DEBT-0001`

---

## DEBT-0011 — `consolidated.sql` no era idempotente; deploy frágil ante estado parcial

- **Estado:** ✅ CERRADA (2026-06-03) — consolidado regenerado idempotente y verificado (corre 2× sin error).
- **Fecha de registro:** 2026-06-03
- **Decisor (asumir como deuda):** Nicolas (humano)
- **Registró:** Orquestador (Claude Cowork)
- **Severidad global:** media — bloqueó un deploy real; no afecta datos ni seguridad.

### Contexto
`docs/deploy/consolidated.sql` se mantenía concatenando las migraciones tal cual: `create type` / `create
table` / `create index` / `create trigger` / `create policy` / `add column` / `add constraint` SIN guardas.
Re-ejecutarlo (o ejecutarlo sobre un estado parcial) abortaba con `42701` (duplicate column) y similares.
Detectado en Capa 0 al desplegar: Nicolas ya tenía `0004` aplicado y el consolidado no pudo añadir `0005`.

### Resolución
Regenerado **de raíz idempotente** (mismo diseño, solo re-ejecutable): `create … if not exists`, do-guards
de enums (`pg_type`), `create or replace trigger/view/function`, `drop policy if exists` + `create`,
`add column if not exists`, `drop constraint if exists` + `add`. Grants/funciones ya eran idempotentes.
**Verificado**: (a) aplicar el consolidado 2 veces seguidas → exit 0; (b) migraciones reales 0000–0004 +
consolidado encima → añade 0005 sin error (escenario exacto del incidente). Nota de uso en `docs/DEPLOY.md` (Vía C).

### Condición de salida
Cumplida. Mantener la idempotencia al añadir futuras migraciones al consolidado (mismas guardas).

### Trazabilidad
- Relaciona: `docs/deploy/consolidated.sql`, `docs/DEPLOY.md`, `DEBT-0006`, `ADR-0011`, `ADR-0012`

---

## DEBT-0012 — El harness de tests comparte DB sin aislar fixtures entre archivos

- **Estado:** abierta (mitigada hoy con años disjuntos — frágil)
- **Fecha de registro:** 2026-06-03
- **Decisor (asumir como deuda):** Nicolas (humano)
- **Registró:** Orquestador (Claude Cowork)
- **Severidad global:** media — no afecta producción; fragiliza los tests (falsos fallos por colisión de datos).

### Contexto
`db/tests/run.sh` carga todos los `2X_*.sql` sobre el MISMO Postgres efímero, en secuencia, sin limpiar
fixtures entre archivos. Las fixtures de un archivo quedan visibles para los siguientes. Al añadir
`26_bi.sql` (ADR-0013), su rango de enero-2020 capturó instancias de `a1` creadas por `25_metrics.sql`
(2020-01-15/16) → el conteo de buckets dio 5 en vez de 3. Se evitó moviendo TODAS las fixtures de 26 a
**2021** (año libre), pero depender de "años disjuntos por archivo" no escala: cada test nuevo debe
conocer las fechas de todos los anteriores.

### Impacto mientras la deuda esté abierta
- Riesgo de falsos fallos/positivos si dos archivos de test usan fechas/usuarios solapados.
- Cada autor de test debe rastrear las fechas usadas por los demás (carga cognitiva, frágil).

### Condición de salida
Aislar fixtures por archivo, p. ej.: (a) envolver cada `2X_*.sql` en `begin … rollback` con las
fixtures dentro (como ya hacen los sub-tests de RLS), o (b) `truncate` de las tablas de fixtures entre
archivos en `run.sh`, o (c) un savepoint por archivo. Con eso, ningún test depende de años disjuntos.

### Trazabilidad
- Relaciona: `db/tests/run.sh`, `db/tests/26_bi.sql`, `db/tests/25_metrics.sql`, `ADR-0013`

---

## DEBT-0013 — `nodemailer` con avisos de seguridad abiertos sin versión parcheada

- **Estado:** abierta (riesgo bajo en el uso actual)
- **Fecha de registro:** 2026-06-09
- **Decisor (asumir como deuda):** Nicolas (humano)
- **Registró:** Agente (Claude Code), confirmado por Orquestador
- **Severidad global:** baja (en nuestro uso) — los CVEs requieren input controlado por el atacante; aquí no lo hay.

### Contexto
El correo de alta (#3, ADR auth/cuenta) usa `nodemailer` (`lib/email/mailer.ts`). La versión instalada
(≤ 8.0.4) tiene avisos de seguridad **abiertos sin parche disponible**: SMTP command injection vía
`envelope.size`, DoS en `addressparser` por recursión, y entrega a dominio no intencionado por conflicto
de interpretación de direcciones.

### Impacto mientras la deuda esté abierta
- **Bajo en el uso actual:** enviamos con **envelope fijo**, **un único destinatario validado** (el email
  que teclea el admin) y **cero entradas controladas por terceros** → los vectores de inyección/DoS no son
  alcanzables por un atacante. No bloquea el MVP.

### Condición de salida
Migrar a **Resend** (u otro servicio) en **v2**, cuando se configure el DNS de pistacore (SPF/DKIM) — de
paso mejora deliverability. Alternativamente, actualizar a una versión de `nodemailer` ya parcheada cuando
exista. Revisar el aviso periódicamente.

### Trazabilidad
- Relaciona: `lib/email/mailer.ts`, `docs/DEPLOY.md §6`, `package.json`, alta de usuario (#3)

---

## DEBT-0014 — Lock de PNPM desincronizado al añadir una dep con npm (build de Vercel roto)

- **Estado:** ✅ CERRADA (2026-06-09) — `pnpm-lock.yaml` regenerado con `pnpm install` (incluye nodemailer
  + @types/nodemailer, sin drift de otras versiones); `pnpm install --frozen-lockfile` pasa en local
  (replica el CI de Vercel). Eliminados los artefactos npm erróneos (`.npmrc legacy-peer-deps`,
  `package-lock.json`). En adelante se usa **PNPM** para este repo.
- **Fecha de registro:** 2026-06-09
- **Decisor:** Nicolas (humano) · **Registró/corrigió:** Agente (Claude Code)
- **Severidad global:** alta mientras estuvo abierta (build de prod roto), trivial de cerrar.

### Contexto (diagnóstico CORREGIDO)
El diagnóstico inicial era **equivocado**: se dijo que "el repo no versiona el lock". En realidad el repo
**usa PNPM** y **sí versiona `pnpm-lock.yaml`** (builds reproducibles). El fallo real fue de proceso:
`nodemailer` (#3) se añadió con **npm** (`package.json` actualizado + `package-lock.json` local), pero
**`pnpm-lock.yaml` no se actualizó** → en Vercel `pnpm install --frozen-lockfile` falló (package.json con
una dep ausente del lock). El "crash de arborist" que motivó la nota era un síntoma de usar npm en un repo
de pnpm, no un problema del árbol.

### Resolución
1. `pnpm install` → regenera `pnpm-lock.yaml` con las deps faltantes (sin tocar otras versiones).
2. `pnpm install --frozen-lockfile` verde en local (= lo que corre Vercel).
3. Borrados `.npmrc` y `package-lock.json` (artefactos npm). Commit del `pnpm-lock.yaml` → Vercel verde.

### Prevención
- **Usar PNPM siempre** en este repo (`pnpm add <dep>`), nunca `npm install` → el `pnpm-lock.yaml` queda
  sincronizado automáticamente.

### Trazabilidad
- Relaciona: `pnpm-lock.yaml`, `package.json`, nodemailer (#3 / DEBT-0013), `docs/DEPLOY.md §6`

---

## DEBT-0015 — Sin rate-limit propio en server actions de auth/admin

- **Estado:** abierta (diferida; riesgo bajo)
- **Fecha de registro:** 2026-06-09
- **Decisor:** Nicolas (humano) · **Registró:** Agente (auditoría ADR-0020)
- **Severidad global:** baja — las acciones sensibles están admin-gated; GoTrue limita los endpoints de auth.

### Contexto
Los Server Actions de Next traen CSRF integrado (POST same-origin + action IDs) y GoTrue aplica rate-limit
a signIn/signUp/recovery. Pero acciones propias como `checkEmailAvailable` (abierta, B6) o `adminCreateUser`
no tienen rate-limit explícito de aplicación.

### Impacto mientras la deuda esté abierta
- `checkEmailAvailable` es un endpoint abierto → permite sondeo de existencia de emails (enumeración leve,
  ya asumida como decisión de producto) y, sin límite, abuso por volumen. Las admin-gated requieren sesión admin.

### Condición de salida
Añadir rate-limit (p. ej. Upstash/Vercel KV por IP) a las acciones públicas sensibles cuando haya tráfico real.

### Trazabilidad
- Relaciona: `lib/actions/account.ts` (checkEmailAvailable), `ADR-0020`, `DEBT-0013`
