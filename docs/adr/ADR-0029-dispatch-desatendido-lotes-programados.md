# ADR-0029 — Envío desatendido de lotes programados (revierte el "oportunista" a v1)

- **Estado:** aceptado (dirección) · **el mecanismo cross-owner lo valida el Agente en preflight antes de core**
- **Fecha:** 2026-06-10
- **Decisor:** Nicolas (humano) · **Redactó:** Orquestador · **Insumo:** Agente (preflight pendiente)
- **¿Toca /core?:** PROBABLE (función DEFINER de dispatch y/o uso de service_role en un job de sistema +
  posible config). El Agente reporta el alcance exacto en preflight; el core se mergea con mi OK +
  `[CORE-APPROVED: ADR-0029]`. DISCIPLINA REFORZADA.

## Contexto

ADR-0027 Act.2-B + el cierre del módulo entregaron la programación de lotes con **dispatch oportunista**
(los lotes `scheduled` vencidos se disparan cuando el propio distribuidor entra a `/ms/lotes`, bajo su
RLS-self, sin service_role). El Orquestador lo recomendó para v1 por evitar superficie cross-owner.

**Nicolas lo revierte:** para su operación, "programar" debe ser **desatendido** — el lote sale a su hora
aunque el distribuidor no esté online. El oportunista no cumple el caso de uso. (El Orquestador acepta la
corrección; su recomendación previa priorizaba aislamiento sobre el valor operativo real.)

## Decisión

**Envío desatendido vía un disparador de cron → una route server-only protegida por secreto** que procesa
los lotes `status='scheduled'` con `scheduled_at <= now()`, cross-owner.

### 1. Por qué esto NO viola ADR-0025
ADR-0025 vetó meter `service_role` en `setStatus` — la **acción de usuario más frecuente**. Un **job de
sistema** (cron) es la categoría **canónica** para credenciales de servicio, igual que el `pg_cron` de
`materialize_day` ya corre como owner del sistema. No se ensancha la superficie de la sesión de un usuario;
se añade un worker de backend acotado. El mecanismo concreto (service_role acotado al job vs **función
DEFINER de dispatch**) lo elige el Agente para **minimizar superficie**; yo apruebo.

### 2. Guardas obligatorias (las fija el Orquestador; el Agente las implementa)
1. **Re-chequear el flag:** no enviar un lote cuyo owner ya **no** tiene `ms_mailing_enabled` (el admin
   pudo revocarlo entre programar y disparar). El dispatcher lo verifica explícito (service_role/DEFINER
   bypassa la RLS → el candado no se aplica solo).
2. **Idempotencia / no doble envío:** lock por `status` (`scheduled → sending` atómico antes de enviar) +
   el `unique(campaign_id, lower(email))` de `ms_sends`. Si dos ejecuciones del cron se solapan, una no
   reprocesa lo de la otra.
3. **Respetar supresiones:** suprimidos → `skipped` (igual que el envío manual).
4. **Secreto server-only:** la route exige un `CRON_SECRET` (header/query), nunca expuesto al cliente.
   Filtrado el secreto, un atacante solo podría **disparar** lotes ya programados por owners legítimos
   (no inyecta destinatarios ni contenido) → daño acotado; aun así el secreto es obligatorio.
5. **Ventana de tiempo:** batch ≤100 por lote → cabe en el límite de la route.

### 3. Pregunta abierta al Agente (viabilidad del disparador)
El plan de Vercel actual puede no dar la **granularidad** de cron necesaria (Hobby limita frecuencia).
El Agente evalúa y recomienda: **Vercel Cron** (si el plan lo permite) · disparador externo
(GitHub Actions / cron-job.org que pinguee la route con el secreto) · o **pg_cron + pg_net** en Supabase.
La DIRECCIÓN (desatendido vía cron + route con secreto + guardas §2) está fija; el disparador concreto lo
decide el Agente con su análisis.

### 4. Oportunista
El cron pasa a ser la vía primaria. El dispatch oportunista existente queda como **complemento inofensivo**
(misma idempotencia) o se retira si el Agente lo ve redundante — a su criterio, no-core.

## Qué se revierte / ajusta
- Revierte ADR-0027 Act.2-B ("disparo = cron no-core" entendido como oportunista) y la decisión de cierre
  "(a) oportunista para v1". **Ajustar los comentarios del código** (0018 y `campaigns.ts`) que afirman que
  el desatendido es v2 → ahora es v1.

## Riesgos
- **[ALTO]** Envío masivo **automático cross-tenant** = la superficie más sensible del módulo → mitigado por
  las guardas §2 (re-chequeo de flag, idempotencia, secreto, supresiones). El Agente declara cualquier hueco.
- **[MEDIO]** Disparador sin granularidad (Vercel Hobby) → §3; si no hay cron fino, el lote se enviaría con
  retraso hasta el siguiente tick. El Agente elige un disparador con granularidad suficiente.
- **[BAJO]** service_role en el job → acotado a la route con secreto, server-only; no toca la sesión de usuario.

## Verificación
- Tests: lote programado vencido se envía sin sesión del owner; owner con flag revocado → NO se envía;
  ejecución solapada del cron → sin doble envío; suprimido → skipped; secreto inválido → 401. Build verde +
  harness. Si hay DEFINER nueva → su test en el harness.

## Ratificación tras preflight + aprobación humana (2026-06-10)

Preflight del Agente + OK explícito de Nicolas. Decisiones firmes:

1. **Mecanismo = `service_role` confinado a la route, NO función DEFINER.** El Agente demostró que una
   DEFINER de dispatch tendría que estar `grant to anon` (la route del cron no tiene sesión) → invocable por
   cualquiera vía PostgREST, y el `CRON_SECRET` (capa HTTP) no protege SQL. El `service_role` server-only es
   **menor** superficie. **Condición dura del Orquestador:** el `service_role` vive **exclusivamente en la
   route del cron** (server-only), NO un helper global reutilizable. Cero objetos DB nuevos; el "core" es la
   **política** (introducir `service_role`, que `lib/env.ts` hoy prohíbe). Aprobado `[CORE-APPROVED: ADR-0029]`.
2. **Disparador = Vercel Cron** (plan **Pro** confirmado por Nicolas 2026-06-10 → frecuencia fina disponible,
   `*/5 * * * *`). Se configura en `vercel.json` (no-core); Vercel inyecta `Authorization: Bearer
   ${CRON_SECRET}` en cada llamada y la route lo valida. **Nicolas solo setea `CRON_SECRET` en Vercel** (un
   solo lugar); sin servicio externo, sin `pg_net`/`pg_cron`. (El cron externo queda como plan B si algún día
   se baja de plan.)
3. **Flag revocado al disparar →** el lote se marca **`failed` con motivo claro** ("módulo deshabilitado para
   el owner"). Sin status nuevo, sin core extra; el distribuidor ve el motivo.
4. **Ruta** bajo `/auth/ms-cron` (público sin sesión, sin tocar middleware, patrón de `/auth/baja`).
5. **Rate-limit** de la route → DEBT (diferido).

## Trazabilidad
- Revierte ADR-0027 Act.2-B / cierre; relaciona ADR-0025 (por qué un job de sistema ≠ el veto de
  service_role en acción de usuario). Core: política de `service_role` confinado (sin objetos DB nuevos).
  No-core: route del cron + ajuste de comentarios + config cron externo. Marcador: `[CORE-APPROVED: ADR-0029]`.
