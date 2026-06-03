# TECH DEBT — Royal Control

> Registro de deuda técnica asumida conscientemente. Una entrada = una deuda con
> condición de salida explícita. Si una deuda no tiene criterio de cierre, no es deuda:
> es un bug sin dueño. El Orquestador mantiene este archivo; cerrar una deuda puede
> requerir ADR si la resolución toca arquitectura o `/core`.

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

- **Estado:** abierta (riesgo ASUMIDO por Nicolas, 2026-06-02)
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
Mover / re-clonar el repo a una ruta local NO sincronizada.

### Trazabilidad
- Incidentes en Hitos 0–3. Relaciona: `DEBT-0001`

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
