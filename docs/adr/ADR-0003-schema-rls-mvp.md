# ADR-0003 — Schema + RLS del MVP (núcleo de datos y aislamiento)

- **Estado:** aceptado
- **Fecha:** 2026-06-02
- **Decisor:** Nicolas (humano) — autoridad final
- **Redactó:** Orquestador (Claude Cowork)
- **Insumo técnico de:** Agente (Claude Code) — diseño Hito 1 (solo-análisis)
- **¿Toca /core?:** SÍ → su ESCRITURA (Hito 2) crea `db/schema.sql`, `db/migrations/0000_*`,
  `db/seed/roles.sql`, `lib/rls-policies/**`. Aprobación humana de la ESCRITURA: 2026-06-02
  (Nicolas) — autorizada con **DISCIPLINA REFORZADA**; billing/core-guard queda en deuda
  (DEBT-0001). Este ADR registra el DISEÑO; no es el código.

## Contexto

El MVP necesita su modelo de datos en Postgres con aislamiento por distribución vía RLS
(regla de seguridad #7 del DATA_MODEL). Es la decisión de mayor downside irreversible del
proyecto: una RLS mal hecha filtra datos entre distribuciones. El Agente entregó el diseño
(viabilidad ALTA, sin contradicciones spec↔modelo). Este ADR fija las decisiones para que la
escritura del Hito 2 sea fiel y auditable.

## Opciones consideradas (decisiones técnicas clave)

1. **Identidad RLS: helpers `SECURITY DEFINER` con lookup a `users` vs claims en JWT.**
   Lookup refleja al instante un cambio de rol del Admin; claims dejan una ventana con el
   permiso viejo vivo hasta refrescar token. Lookup es `stable` + PK index → barato. Score: 4.7
2. **Aislamiento de `task_instances`: desnormalizar `distribution_id`/`owner_user_id` vs
   join/subquery a `tasks` en cada policy.** `task_instances` no tiene `distribution_id`
   propio; un join olvidado en una policy filtra entre distribuciones. Desnormalizar →
   policy es filtro plano indexable, imposible de "olvidar". Score: 4.7
3. **Tope de 3 owners: `owner_slot` + `unique` vs trigger contador.** El trigger naive tiene
   carrera (dos INSERT concurrentes pasan el conteo). `owner_slot smallint CHECK(1..3)` +
   `UNIQUE(distribution_id, owner_slot)` = tope duro sin race. Score: 4.6

## Decisión

Se adopta el diseño del Agente con las decisiones de producto resueltas abajo. Score final: **4.7**.

### Estrategia de aislamiento (no negociable)
- `ENABLE` RLS en **todas** las tablas de negocio, incluidas las vacías post-MVP (`org_hierarchy`).
- `FORCE` RLS en las sensibles → ni el owner de tabla escapa. Solo `service_role` (server-side) bypassa.
- **Default-deny**: sin policy que matchee → denegado. `jd`/`seller` (enum día 1, sin lógica MVP) caen a deny.
- Helpers `auth.current_role()` / `auth.current_distribution()`: `SECURITY DEFINER`, **`set search_path=''`
  obligatorio** (anti-injection), propietario `postgres` (bypass-RLS → sin recursión contra `users`).
- Self-policy de `users`: `using (id = (select auth.uid()))` directo, **nunca** llamando funciones que
  lean `users` bajo RLS (anti-recursión).

### Decisiones de producto resueltas (autoridad: Nicolas, 2026-06-02)
- **Scope del distributor = SELF.** En MVP el distribuidor lee/escribe solo lo suyo
  (`owner_user_id = auth.uid()`), NO toda su distribución. (Corrige una sobre-extensión del
  diseño; SPEC §3 dice "sus tareas / propias".) La jerarquía (ver sus JD/sellers) llega
  post-MVP vía `org_hierarchy`.
- **Auditor = solo métricas.** SELECT a `metric_snapshots` (todas) + labels (`users`,
  `distributions`). **Sin drill-down** a `tasks`/`task_instances`. Sin INSERT/UPDATE/DELETE en nada.
- **Franja horaria global = constante 8–22** en la app. Personalización por usuario vía
  `users.preferences` (ya en el modelo). El "Admin define el global" (SPEC §7) se **difiere a
  Tier 4** → no se crea tabla de settings en MVP.
- **Seed (`db/seed/roles.sql`):** SIN categorías globales de fábrica (el Admin las crea). Primer
  admin asignado **manualmente** vía Supabase (sin email hardcodeado en seed).
- **CHECK rol↔distribución (ratificado):** `role='distributor' ⇒ distribution_id NOT NULL`;
  `role IN('admin','auditor') ⇒ distribution_id NULL`. Evita un distribuidor sin distribución.
- **Materialización de `task_instances` = job programado** (no lazy), para que las "no hechas"
  de días pasados existan como filas (registro histórico del incumplimiento). El schema lo
  habilita con `unique(task_id,date)` (idempotencia); la lógica del job es de un hito posterior.

### Matriz de policies (rol × tabla × verbo) — la escritura del Hito 2 debe ser fiel a esto

| Tabla | admin | auditor | distributor (self) | role=null |
|---|---|---|---|---|
| distributions | CRUD | SELECT (labels) | SELECT (la suya) | — |
| users | CRUD | SELECT (labels) | SELECT/UPDATE self (campos propios) | **SELECT self** |
| distribution_owners | CRUD | — | SELECT (su distribución) | — |
| org_hierarchy | CRUD | — | SELECT (su rama, vacía en MVP) | — |
| task_categories | CRUD (global) | — | SELECT (global+propias) · CUD (propias) | — |
| tasks | CRUD | — | CRUD where owner=self | — |
| task_instances | CRUD | — | SELECT/UPDATE where owner=self | — |
| metric_snapshots | CRUD | **SELECT (todas)** | SELECT self | — |
| calendar_links | CRUD | — | CRUD self | — |
| calendar_sync_conflicts | CRUD | — | SELECT/UPDATE self | — |
| notifications | CRUD | — | SELECT/UPDATE self | — |

`—` = ninguna policy = denegado (default-deny). Escrituras de `metric_snapshots` y materialización
de `task_instances`: vía `service_role` (job), nunca el cliente. `jd`/`seller`: sin policies = deny.

## Qué se borró / simplificó

- **Drill-down del auditor** a tareas crudas: borrado del MVP (menor superficie de fuga).
- **Tabla de settings global** para la franja: borrada (constante + diferir a Tier 4).
- **Scope del distributor por distribución**: reducido a self (menos exposición, fiel al spec).
- **Trigger contador de owners**: reemplazado por `owner_slot`+`unique` (sin carrera).
- **Join a `tasks` en policies de instancias**: eliminado vía desnormalización.
- **Categorías globales de fábrica**: ninguna; el Admin las crea.

## Riesgos detectados (insumo del Agente)

**Alto** — mitigado en el diseño salvo nota:
- `task_instances` sin `distribution_id` propio → fuga si la policy olvida el scope. Mitiga:
  desnormalizar + trigger de poblado + `tasks.distribution_id` inmutable (trigger).
- `SECURITY DEFINER` sin `search_path=''` → injection. **Mandatorio** fijarlo.
- Recursión RLS en `users`. Mitiga: self-policy directa + helpers bypass-RLS.
- Tabla con RLS sin activar (esp. `org_hierarchy` vacía) → hueco latente. Activar en todas.
- **Realtime de Supabase debe aplicar RLS** en su publicación, o `postgres_changes` filtra
  entre distribuciones. ⚠ A verificar explícitamente en el Hito 2.

**Medio-alto:** carrera de owners (mitiga: `owner_slot`+`unique`); distribuidor con
`distribution_id` null (mitiga: CHECK).

**Medio:** snapshots editables si falta el trigger append-only (mitiga: trigger BEFORE
UPDATE/DELETE → RAISE + `unique(user_id,period,period_start)`); **`service_role` bypassa RLS en
server actions** → toda lógica server re-verifica autorización a mano; Storage (logo/photo)
necesita policies de bucket que aíslen igual (definir en su hito).

**Bajo:** `jd`/`seller` sin policies en MVP → deny (correcto).

## Consecuencias

- **Positivas:** modelo fiel al DATA_MODEL, aislamiento por distribución sin huecos conocidos,
  reglas duras forzadas en DB (no en frontend), preparado para post-MVP sin migración dolorosa.
- **Negativas / deuda asumida:** desnormalización en `task_instances` (mantener coherencia vía
  triggers); materialización requiere un job (hito posterior); Storage y Realtime-RLS quedan
  como verificaciones pendientes del Hito 2.
- **Reversibilidad:** Tipo 2, pero **cara** — cambiar el modelo de aislamiento con datos ya
  cargados es delicado. La desnormalización de `task_instances` es estructural.
- **GATE DE ESCRITURA (Hito 2) — RESUELTO 2026-06-02:**
  (1) ADR aceptado ✓ (Nicolas).
  (2) Billing NO resuelto: Nicolas eligió **escribir con disciplina reforzada** (core-guard
  sigue caído, DEBT-0001). Sustituto del guard, obligatorio en el Hito 2:
  pre-flight obligatorio; commit con `[CORE-APPROVED: ADR-0003]`; **tests de aislamiento RLS
  que DEMUESTREN (no asuman)** que un distributor no ve otra distribución, que `role=null` no
  lee negocio y que el auditor no lee `tasks`/`task_instances`; y revisión del diff completo
  por el Orquestador ANTES del merge a `main`.

## Trazabilidad

- Relaciona: `ADR-0001`, `ADR-0002`, `docs/PROJECT_SPEC.md`, `docs/DATA_MODEL.md`, `docs/TECH_DEBT.md`
- Habilita: Hito 2 (escritura de `db/schema.sql`, `db/migrations/0000_init`, `0001_rls` /
  `lib/rls-policies/**`, `db/seed/roles.sql`) — todo con `[CORE-APPROVED: ADR-0003]`.
- Deudas relacionadas: DEBT-0001 (gate de escritura), DEBT-0002.
