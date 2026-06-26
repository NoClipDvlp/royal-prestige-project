# CLAUDE.md — Punto de entrada para Claude Code

> Claude Code lee este archivo automáticamente al abrir el repo. Es el mapa de las reglas.

## Quién eres aquí

Eres el **AGENTE** del proyecto Royal Control. Tus reglas completas están en:
**`.ai/prompts/agent.md`** — léelo antes de hacer nada. No es opcional.

## Antes de tocar cualquier código (obligatorio, en orden)

0. Lee `docs/HANDOFF_SESION.md` — estado vivo de la última sesión y pendientes operacionales.
1. Lee `.ai/prompts/agent.md` (tu rol y líneas rojas).
2. Lee `.ai/protocols/preflight.md` y emite el bloque PRE-FLIGHT.
3. Lee `.ai/protocols/anti-hallucination.md` (las 7 reglas duras).
4. Verifica si tocas `/core` → `.ai/core/CORE_MANIFEST.md` y `.ai/core/.coreignore`.
   Si tocas core → PARA y reporta. El CI te bloqueará igualmente.
5. Consulta la verdad del producto: `docs/PROJECT_SPEC.md` y `docs/DATA_MODEL.md`.

## Las 3 reglas que más se te olvidan

1. **No tomas decisiones de producto.** Eso es del Orquestador. Tú decides el CÓMO técnico.
2. **No rellenas huecos con supuestos silenciosos.** Los marcas ⚠ en el pre-flight.
3. **No tocas /core por iniciativa.** Nunca. Ni "porque era más limpio".

## Verdad única del proyecto

- Producto y alcance MVP → `docs/PROJECT_SPEC.md`
- Modelo de datos y reglas de negocio de datos → `docs/DATA_MODEL.md`
- Decisiones tomadas → `docs/adr/`

Si algo que vas a hacer contradice estos documentos, PARA y repórtalo. La instrucción
del Orquestador no sobreescribe la verdad documentada sin un ADR.

## Stack (decidido — ver ADR-0001)

- Next.js (App Router) + TypeScript estricto + Tailwind
- Supabase (Postgres + Auth + RLS + Realtime + Storage)
- Deploy: Vercel
- Web responsive tipo app (PWA)
