# ADR-0002 — Bootstrap del Hito 0: scaffolding base

- **Estado:** aceptado
- **Fecha:** 2026-06-02
- **Decisor:** Nicolas (humano) — autoridad final
- **Redactó:** Orquestador (Claude Cowork)
- **Insumo técnico de:** Agente (Claude Code)
- **¿Toca /core?:** SÍ → crea `next.config.mjs` (ruta protegida en `.coreignore`).
  Aprobación humana registrada el: 2026-06-02 (Nicolas, vía Orquestador).

## Contexto

ADR-0001 fijó el stack (Next.js + Supabase + Vercel). Falta el esqueleto ejecutable sobre
el que construir los hitos siguientes. El scaffolding inicial crea, por primera vez,
`next.config.mjs` — archivo protegido como core. Crear el andamiaje fundacional es un acto
único que necesita autorización humana explícita, no una excepción recurrente.

## Opciones consideradas

1. **Bootstrap del Hito 0 con aprobación humana del archivo core** (pnpm + Next 16 LTS) — el
   scaffold crea `next.config.mjs` vacío bajo un ADR firmado. Pro: arranque limpio y trazable.
   Contra: requiere la firma. Score: 4.8
2. **Scaffolding solo no-core, `next.config.mjs` aparte** — más lento, fragmenta el bootstrap
   sin reducir riesgo real (el archivo nace vacío). Score: 4.0
3. **Bootstrap amplio (scaffold + schema + RLS + auth de una)** — rápido pero aprueba core
   crítico (RLS = aislamiento de datos) sin verlo paso a paso. Descartado por riesgo. Score: 3.2

## Decisión

**Opción 1.** Gestor **pnpm 11.5.1** (instalación eficiente, lockfile estricto). Runtime
**Node 22 LTS**. Stack verificado contra el registro (no asumido): **Next 16.2.7 (LTS desde
oct-2025), React 19.2.7, TypeScript 6.0.3 (strict), Tailwind 4.3.0 (CSS-first),
@supabase/supabase-js 2.107.0**. Se autoriza crear **`next.config.mjs`** (único archivo core
del Hito 0), vacío. Score final: **4.8**.

## Qué se borró / simplificó

- `tailwind.config.ts` omitido — Tailwind v4 es CSS-first, la config es opcional.
- ESLint diferido — flat-config eslint@10 + next@16 añadía riesgo y no es criterio de éxito
  del Hito 0; se incorpora en un hito posterior.
- `sharp` deshabilitado (`allowBuilds.sharp=false`) — Hito 0 no usa imágenes; se reactiva al
  entrar logos/fotos.
- Cliente Supabase como **factory**, no singleton — difiere la lectura de env, sin efectos al importar.

## Riesgos detectados (insumo del Agente)

- **Hueco de gobernanza** — severidad media: `.coreignore` protege `next.config.mjs` pero NO
  `next.config.ts|js`. Un futuro rename esquivaría el guard. → se registra como deuda DEBT-0002.
  Mitigación: cerrar requiere editar `.coreignore` (core) → su propio ADR.
- **`sharp` off** — severidad baja: reactivar antes de implementar logos/fotos, o las imágenes
  de Next no optimizarán.
- **Madurez del stack** — severidad baja (resuelta): Next 16 es LTS estable desde oct-2025
  (verificado jun-2026). No es bleeding-edge.

## Consecuencias

- **Positivas:** esqueleto ejecutable verificado (`pnpm dev` 200, `build` limpio, strict activo,
  Tailwind compila, `node_modules`/`.env` ignorados). Base lista para Hito 1.
- **Negativas / deuda asumida:** DEBT-0002 (hueco `next.config.ts|js`). ESLint y `sharp` pendientes.
- **Reversibilidad:** Tipo 2 (scaffolding reemplazable con bajo costo).

## Trazabilidad

- Relaciona: `ADR-0001`, `docs/PROJECT_SPEC.md`, `docs/DATA_MODEL.md`, `docs/TECH_DEBT.md`
- Rama: `feat/hito-0-scaffolding` (heredada de `chore/gitignore-blindaje-secretos`, PR #1).
- Archivos afectados: `next.config.mjs` (core), package.json, tsconfig.json, postcss.config.mjs,
  .env.example, app/{layout,page}.tsx, app/globals.css, lib/env.ts, lib/supabase/client.ts, lockfile.
- Marcador de commit autorizado: `[CORE-APPROVED: ADR-0002]` (válido solo con estado = aceptado).
