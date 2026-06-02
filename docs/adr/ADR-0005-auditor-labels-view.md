# ADR-0005 — Auditor restringido a labels vía vista (cierra DEBT-0004)

- **Estado:** aceptado
- **Fecha:** 2026-06-02
- **Decisor:** Nicolas (humano) — autoridad final
- **Redactó:** Orquestador (Claude Cowork)
- **Insumo técnico de:** Agente (Claude Code) — diseño solo-análisis
- **¿Toca /core?:** SÍ → `db/migrations/0001_auditor_labels.sql` y `lib/rls-policies/policies.sql`
  (ambos core). Aprobación humana: 2026-06-02 (Nicolas, vía Orquestador). Ejecución con
  **DISCIPLINA REFORZADA** (core-guard caído por billing, DEBT-0001 ítem 1).

## Contexto

`users_select` da hoy al auditor la fila COMPLETA de `users` (email, phone, photo_url,
preferences, auth_providers = PII). Decisión de Nicolas (DEBT-0004): el auditor lee solo
`full_name` + `distribution_id`. La RLS es row-level, no column-level; y como auditor y
distributor comparten el rol de DB `authenticated`, ni RLS ni column-GRANTs pueden limitar
columnas por rol de aplicación. La única vía correcta es una vista de proyección + retirar al
auditor de la tabla cruda.

## Opciones consideradas

1. **Vista definer `users_labels` + gate por rol** — proyección de 3 columnas, joins ergonómicos
   para el ranking. Warning del linter de Supabase (definer view), intencional y documentado. Score: 4.6
2. **Función `SECURITY DEFINER` que devuelve `TABLE(...)`** — misma semántica, sin warning, pero
   menos ergonómica para joins (hay que invocarla). Score: 4.2
3. **No hacer nada** — el auditor sigue viendo PII. Descartada (incumple la decisión de DEBT-0004).

## Decisión

**Opción 1.** Score final: **4.6**.

### Vista (DDL — va en `db/migrations/0001_auditor_labels.sql`)
```
create view public.users_labels with (security_barrier = true) as
  select id, full_name, distribution_id
  from public.users
  where auth.current_role() in ('admin','auditor');
-- security_invoker = FALSE (explícito/por defecto): corre como owner (bypass RLS de users)
-- para ver todas las distribuciones; el WHERE de rol ES el control de acceso.
grant select on public.users_labels to authenticated, service_role;  -- anon: nada
```
- `security_invoker = false` (definer): necesario — con `invoker=true` el auditor, ya sin SELECT
  sobre `users`, vería 0 filas.
- El `where auth.current_role() in ('admin','auditor')` gatea: distributor y `role=null` → 0 filas.
- `security_barrier = true`: impide que el optimizador empuje predicados del usuario por debajo del
  gate (evita fugas vía funciones inyectadas en el predicado).
- Proyección a `id` (join), `full_name`, `distribution_id` → CERO PII.

### Política (va en `lib/rls-policies/policies.sql` Y como ALTER en la migración 0001)
Quitar `auditor` de `users_select`:
```
users_select  USING ( auth.current_role() = 'admin' or id = (select auth.uid()) )
```
El auditor pasa a 0 filas en `users` crudo. Arma el ranking con
`metric_snapshots ⨝ users_labels ⨝ distributions`.

### Decisión de arquitectura de migraciones (resuelve el hueco que destapó el Agente)
Ahora que ADR-0004 protege `db/migrations/` completo, **los cambios de RLS y schema posteriores
al Hito 2 viven en migraciones numeradas** (`db/migrations/0001+`). `lib/rls-policies/policies.sql`
se mantiene SINCRONIZADO como snapshot de referencia del estado de RLS, pero la verdad aplicable a
una DB ya desplegada es la migración. El delta de DEBT-0004 va en `0001_auditor_labels.sql`;
`policies.sql` se actualiza para reflejar `users_select` sin auditor (consistencia para deploy fresh).

## Qué se borró / simplificó

- El acceso del auditor a `users` cruda: eliminado (no lo necesita para nada más que labels, por
  ADR-0003 sin drill-down).
- Se descartó column-GRANTs (no distinguen auditor de distributor; romperían el acceso del
  distributor a su propia PII).

## Riesgos detectados (insumo del Agente)

- **[ALTO] Definer-view mal gateado** filtraría labels cross-distribución a cualquier `authenticated`.
  Mitiga: gate por rol + `security_barrier` + proyección 3 columnas + GRANT. **DEBE testearse.**
- **[MEDIO] `security_invoker` puesto en `true`** por un futuro editor → auditor ve 0 labels (rompe
  función, no es fuga). Mitiga: comentario explícito en el SQL + test que afirma conteo > 0.
- **[MEDIO] Warning del linter** "security definer view" — intencional; documentar en el SQL.
- **[BAJO]** Exponer `id`/`distribution_id` no es PII; `full_name` es el label deseado.

## Consecuencias

- **Positivas:** cierra DEBT-0004; el auditor cumple "solo labels" sin PII; aislamiento intacto.
- **Negativas / deuda:** introduce un definer-view (footgun documentado y testeado). Mantener
  `policies.sql` sincronizado con las migraciones (riesgo de divergencia si se descuida).
- **Reversibilidad:** Tipo 2 (drop view + restaurar la policy).

## Verificación obligatoria (tests de aislamiento — extienden la suite del Hito 2)

> **Corrección 2026-06-02 (criterio (a)):** la redacción original "auditor → 0 filas en `users`"
> estaba mal especificada — chocaba con el invariante de auto-acceso universal (`id = auth.uid()`,
> ADR-0003: todo usuario, incluido `role=null`, lee su propia fila). La propiedad real de DEBT-0004
> es que el auditor NO vea PII de **OTROS**; ver su propia fila es correcto y consistente con todos
> los roles. El test (a) se ajusta a ello. La decisión sustantiva (auditor sin PII ajena) no cambia.

(a) auditor: en `users` crudo ve **solo su propia fila** (`count = 1`) y **0 filas de otros**
(`count(users where id <> auditor) = 0`). (b) auditor: `users_labels` → todas las filas, y la
vista NO expone email/phone/preferences (verificar el SET de columnas, no solo conteo). (c)
distributor: `users_labels` → 0; `users` → solo su fila. (d) `role=null`: `users_labels` → 0;
`users` → su fila. (e) admin: `users` → todas; `users_labels` → todas.

## Trazabilidad

- Relaciona: `ADR-0003`, `ADR-0004`, `lib/rls-policies/policies.sql`, `docs/DATA_MODEL.md`
- Cierra: DEBT-0004. Archivos core: `db/migrations/0001_auditor_labels.sql`, `lib/rls-policies/policies.sql`.
- Marcador de commit autorizado: `[CORE-APPROVED: ADR-0005]` (válido solo con estado = aceptado).
