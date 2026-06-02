# Royal Control

App de control de procesos (Royal Prestige). Web responsive tipo app (PWA).

## Stack (ADR-0001)

- Next.js 16 (App Router) + TypeScript estricto
- Tailwind CSS v4 (CSS-first)
- Supabase (Postgres + Auth + RLS + Realtime + Storage) — cliente; schema/auth en hitos posteriores
- Deploy: Vercel
- Gestor de paquetes: **pnpm**

## Requisitos

- Node.js >= 20.9 (recomendado 22 LTS)
- pnpm

## Arranque (Hito 0 — esqueleto base)

```bash
pnpm install
cp .env.example .env.local   # rellena los valores de Supabase
pnpm dev                     # http://localhost:3000
```

Otros scripts:

```bash
pnpm build       # build de producción
pnpm typecheck   # tsc --noEmit (TS estricto)
```

## Estado

Hito 0: esqueleto ejecutable. **Sin** schema/DB, **sin** auth, **sin** features.
El modelo de datos (`docs/DATA_MODEL.md`) y la seguridad (RLS) llegan en hitos posteriores
y son **core** (ver `.ai/core/CORE_MANIFEST.md`).

## Gobernanza

Este repo opera bajo reglas de `/.ai`. Antes de tocar código, lee `CLAUDE.md` y
`.ai/prompts/agent.md`. El núcleo (`/core` y rutas de `.ai/core/.coreignore`) no se
modifica sin ADR aprobado.
