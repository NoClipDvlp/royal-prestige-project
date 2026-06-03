# ADR-0009 — UI real por rol + panel de administración

- **Estado:** aceptado
- **Fecha:** 2026-06-03
- **Decisor:** Nicolas (humano) — autoridad final
- **Redactó:** Orquestador (Claude Cowork)
- **Insumo técnico de:** Agente (Claude Code) — diseño solo-análisis
- **¿Toca /core?:** NO. Todo es `app/**` + server actions (`lib/actions/**`) + `lib/supabase/admin.ts`.
  La RLS y los triggers existentes ya soportan admin/auditor/distributor. (Único punto sensible:
  `SUPABASE_SERVICE_ROLE_KEY` server-only — config, no código core.)

## Contexto

Tras el despliegue real se confirmó que: el dashboard (`/inicio`) seguía **mock** (saludo "Nicolás"
hardcodeado, stats de ejemplo), **no hay diferenciación de UI por rol** (el admin ve el panel de
distribuidor), y **falta el panel de administración** que pide el SPEC §3. El backend funciona; lo
que falta es la capa de UI por rol.

## Decisión

### Diferenciación por rol
NAV role-aware (server component lee `getProfile().role`) + `requireRole(...)` por página + `"/"` como
**dispatcher** (distributor → su dashboard; admin → `/admin`; auditor → `/metricas`). Defensa en
profundidad: la RLS filtra los datos aunque el routing fallara.
- **distributor:** Inicio · Tareas · Métricas (propias) · Ajustes.
- **admin:** Admin (Usuarios/Distribuciones/Categorías) · Métricas globales · Ajustes.
- **auditor:** nav mínima/placeholder (su ranking/métricas se **difiere**, ver abajo).

### Dashboard del distribuidor (datos reales — reemplaza el mock)
- Saludo con `full_name` real (RLS self).
- Stats de la semana (hechas/medias/pendientes): COUNT de sus `task_instances` por `status_pct` (RLS self).
- **% meta semanal = cumplimiento ponderado de lo TRANSCURRIDO** (tareas de la semana hasta hoy; no
  penaliza días futuros). **Pendientes = tareas de HOY con `status_pct < 100`.**
- **Pesos de prioridad: low/medium/high = 1 / 2 / 3.** Prioridad efectiva = `coalesce(instance.priority, task.priority)`.
- **Semana = lun–dom, TZ `America/Bogota`** (consistente con `app_today`).

### Panel admin (SPEC §3)
- Listar usuarios; **asignar rol/distribución con la SESIÓN del admin** (RLS admin + el trigger permite
  porque `app_current_role()='admin'` → sin `service_role`, esquiva DEBT-0010). Respeta el CHECK rol↔distribución.
- Crear/editar distribuciones; crear categorías globales (RLS admin).
- **Admin edita rol/distribución/nombre/foto, NO el email** (identificador de auth; cambiarlo es flujo aparte, diferido).
- Crear usuarios (**con contraseña temporal**, no invitación por email mientras DEBT-0008/SMTP siga abierta)
  y reset password: vía API admin de GoTrue con **`service_role` GATEADO por `assertCallerIsAdmin()`** y
  env **server-only `SUPABASE_SERVICE_ROLE_KEY`** (nunca `NEXT_PUBLIC` ni al repo). Primera vez que se usa service_role.

## Qué se borró / simplificó

- El dashboard mock del Hito 3 → datos reales.
- **Auditor (ranking/métricas en vivo): diferido** — depende del **job de `metric_snapshots`** (no existe
  aún) y de leer agregados cross-distribución. Va en su propio hito junto con ese job.
- **Owners de distribución (≤3): diferidos** a un refinamiento posterior del panel.
- Invitación por email: diferida (SMTP, DEBT-0008) → se crea con contraseña temporal.

## Riesgos

- **[MEDIO] Primera vez con `service_role` en server**: mitiga `assertCallerIsAdmin()` ANTES + env
  server-only. Toda action que lo use re-verifica rol.
- **[BAJO] Divergencia de la fórmula del KPI**: el cumplimiento se calcula app-side aquí y lo recalculará
  el job de snapshots después → riesgo de fórmulas distintas. Mitigación futura: función de cumplimiento
  compartida en DB (core, otro ADR). Para MVP: app-side documentado.

## Verificación

- Cada rol ve su nav y su home; un distributor que navega a `/admin` → redirigido (y la RLS no le da datos).
- Dashboard del distribuidor muestra stats reales de sus instancias; el % y los pendientes cuadran con la fórmula.
- Admin asigna rol/distribución desde la UI sin SQL ni disable de trigger; el CHECK rol↔distribución se respeta.
- `service_role` solo en `lib/supabase/admin.ts`, nunca importado en cliente; las actions re-gatean por admin.
- Capturas claro/oscuro de: dashboard distribuidor, panel admin (usuarios + asignación), para revisión visual.

## Trazabilidad

- Relaciona: `ADR-0006`, `ADR-0007`, `docs/PROJECT_SPEC.md` §3/§8, `DEBT-0008`, `DEBT-0010`.
- Depende a futuro: job de `metric_snapshots` (habilita auditor/ranking).
- No requiere `[CORE-APPROVED]` (no toca core).
