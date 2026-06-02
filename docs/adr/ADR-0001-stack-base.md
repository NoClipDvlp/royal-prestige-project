# ADR-0001 — Stack base: Next.js + Supabase + Vercel

- **Estado:** aceptado
- **Fecha:** 2026-06-01
- **Decisor:** Nicolas (humano)
- **Redactó:** Orquestador (Claude Cowork)
- **¿Toca /core?:** NO (lo define)

## Contexto

Royal Control necesita: auth con Google + email/contraseña, control de acceso por rol con
aislamiento de datos entre distribuciones, sincronización en tiempo real para calendario,
y almacenamiento de fotos/logos. Hacerlo pegando varios servicios sueltos multiplica la
superficie de error.

## Opciones consideradas

1. **Supabase (Postgres + Auth + RLS + Realtime + Storage)** — todo en uno; RLS encaja
   exacto con el modelo de permisos por rol/distribución. Score: 4.6
2. **Firebase** — bueno en realtime/auth, pero el modelo relacional (distribución → N
   distribuidores → jerarquía) sufre en NoSQL. Score: 3.7
3. **Stack armado (Postgres + Auth0 + Pusher + S3)** — máximo control, máxima complejidad
   y costo de integración para un MVP. Score: 3.4

## Decisión

**Supabase + Next.js (App Router) + TypeScript estricto + Tailwind, deploy en Vercel.**
Web responsive tipo app (PWA). Score final: 4.6. El RLS de Postgres resuelve el
requisito de seguridad más crítico (Auditor sin CRUD, aislamiento por distribución) de
forma nativa, sin lógica de permisos dispersa en el frontend.

## Qué se borró / simplificó

- Se descartó armar el stack a mano (4 proveedores → 1).
- Sync de calendario **solo push** en MVP (bidireccional → Tier 4). Elimina la clase
  entera de bugs de conflicto de merge.

## Riesgos detectados

- **Residencia de datos** — severidad baja: confirmado que no hay requisito regional.
- **Lock-in con Supabase** — severidad media: mitigado porque es Postgres estándar por
  debajo; migrable si hiciera falta.

## Consecuencias

- **Positivas:** una sola superficie, RLS nativo, realtime y storage incluidos.
- **Negativas / deuda:** dependencia de un proveedor gestionado.
- **Reversibilidad:** Tipo 2 (reversible con esfuerzo; el core es Postgres estándar).

## Trazabilidad

- Relaciona: `docs/PROJECT_SPEC.md`, `docs/DATA_MODEL.md`
- Define como core: `db/schema.sql`, migraciones base, `lib/rls-policies/**`
