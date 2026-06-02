# ADR-0004 — Saneamiento de cobertura del core-guard

- **Estado:** aceptado
- **Fecha:** 2026-06-02
- **Decisor:** Nicolas (humano) — autoridad final
- **Redactó:** Orquestador (Claude Cowork)
- **Insumo técnico de:** Agente (Claude Code) — verificación de globs en pre-flight
- **¿Toca /core?:** SÍ → edita `.ai/core/.coreignore` (core) y `.github/workflows/core-guard.yml`.
  Aprobación humana: 2026-06-02 (Nicolas, vía Orquestador). Ejecución con **DISCIPLINA REFORZADA**
  (core-guard caído por billing, DEBT-0001 ítem 1, riesgo asumido por Nicolas).

## Contexto

El core-guard tiene tres huecos de cobertura y un bug, detectados durante los Hitos 0–2 y
registrados como deuda. Mientras billing siga caído el guard no corre, pero saldar estos
huecos ahora deja el sistema **correcto para cuando reviva** — y evita que el hito de auth
(que escribe más core) herede los huecos. La ironía está asumida: saneamos el guard mientras
el guard no se ejecuta; el sustituto es la revisión del diff del Orquestador + pre-flight.

## Decisión

Score final: **4.6**. Se ejecuta con disciplina reforzada (pre-flight con verificación bash
de globs + revisión del diff por el Orquestador antes del merge; commit `[CORE-APPROVED: ADR-0004]`).

### 1. Ampliar `.coreignore` (cierra DEBT-0002, DEBT-0003, DEBT-0001 ítem 3)
Añadir las rutas protegidas:
- `next.config.*` — cubre `.mjs`/`.ts`/`.js` (hoy solo protege `next.config.mjs`). **DEBT-0002.**
- `db/migrations/` — directorio completo, no solo `0000_*`; toda migración futura queda cubierta. **DEBT-0003.**
- `.github/workflows/core-guard.yml` — el guard se protege a sí mismo; nadie lo neutraliza sin
  `[CORE-APPROVED]`. **DEBT-0001 ítem 3.**

El Agente debe verificar con la **lógica bash del workflow** que cada patrón matchea lo esperado
y no rompe el matching existente, y reportarlo en el pre-flight.

### 2. Arreglar el push-trigger del workflow (cierra DEBT-0001 ítem 2)
Cambiar `push: branches: ['**']` → `push: branches: [main]`.
Elimina el falso positivo en branches nuevos (que comparan contra árbol vacío → marcan `.ai/**`
en falso) sin perder la protección: el trigger `pull_request` cubre el diff real de cada PR, y
el push directo a `main` (`before` = tip real, sin bug) sigue guardado. Branches que nunca
llegan a `main` son irrelevantes para el core.

## Qué se borró / simplificó

- El trigger `push: ['**']` roto → reducido a `[main]` (se borra el caso que producía el falso positivo).
- El patrón estrecho `db/migrations/0000_*` → generalizado a `db/migrations/`.
- (Opcional, a confirmar en pre-flight) la entrada `db/schema.sql` de `.coreignore` apunta a un
  archivo que no existe (el schema vive en `db/migrations/0000_init.sql`); puede limpiarse o dejarse inocua.

## Riesgos detectados

- **Ejecución sin guard** — severidad media: el commit `[CORE-APPROVED: ADR-0004]` no será validado
  por CI hasta que billing reviva. Sustituto: pre-flight + revisión del diff del Orquestador.
- **Auto-referencia** — baja: añadir `core-guard.yml` a `.coreignore` y editarlo en el mismo commit
  es consistente (el commit lleva el marcador); para cuando el guard corra, el archivo ya está
  protegido y arreglado.
- **Glob mal formado** — baja: mitigado por la verificación bash obligatoria del Agente en pre-flight.

## Consecuencias

- **Positivas:** cierra DEBT-0002, DEBT-0003 y DEBT-0001 ítems 2 y 3. El guard queda con cobertura
  correcta y sin falsos positivos para cuando billing reviva.
- **Negativas / deuda restante:** DEBT-0001 ítem 1 (billing) sigue abierto — acción personal de
  Nicolas, fuera de este ADR. DEBT-0004 (PII auditor) va en su propio ADR.
- **Reversibilidad:** Tipo 2 (fácil; son patrones de texto y un trigger).

## Trazabilidad

- Relaciona: `ADR-0002`, `ADR-0003`, `.ai/core/.coreignore`, `.github/workflows/core-guard.yml`
- Cierra: DEBT-0002, DEBT-0003, DEBT-0001 (ítems 2 y 3). Deja abierto: DEBT-0001 ítem 1, DEBT-0004.
- Marcador de commit autorizado: `[CORE-APPROVED: ADR-0004]` (válido solo con estado = aceptado).
