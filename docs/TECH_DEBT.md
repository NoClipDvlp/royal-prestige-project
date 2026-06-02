# TECH DEBT — Royal Control

> Registro de deuda técnica asumida conscientemente. Una entrada = una deuda con
> condición de salida explícita. Si una deuda no tiene criterio de cierre, no es deuda:
> es un bug sin dueño. El Orquestador mantiene este archivo; cerrar una deuda puede
> requerir ADR si la resolución toca arquitectura o `/core`.

---

## DEBT-0001 — Enforcement de core-guard inoperante

- **Estado:** abierta
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
| 2 | `push`-trigger da falso positivo en branches nuevos (compara contra árbol vacío → marca `.ai/**` en falso) | Media | Agente (prepara fix) | Narrow `push: branches: ['**']` → `[main]`; ADR + PR separado; verde tras billing |
| 3 | `core-guard.yml` no se autoprotege (no está en `.coreignore`) → editable para neutralizarlo sin freno | Media | Nicolas (aprobación core) | Meter el workflow en `.coreignore`; requiere ADR + commit `[CORE-APPROVED]` |

### Impacto mientras la deuda esté abierta

- Cualquier cambio a `/core` (schema, RLS, auth, rbac) **no es bloqueado físicamente**.
  Riesgo latente de filtración de datos entre distribuciones si un cambio mal hecho a RLS
  entra sin que nadie lo note. Mitigación temporal: ningún handoff puede tocar `/core` sin
  aprobación explícita de Nicolas (regla de proceso, no de CI).
- Score del estado de gobernanza con esta deuda abierta: **3.5 / 5.0**.

### Criterio de cierre de la deuda completa

Los 3 ítems verdes: billing activo, `core-guard` corriendo y pasando en verde sobre un PR
real, y el propio workflow protegido en `.coreignore`. Al cerrarse, el score de gobernanza
vuelve a ≥4.6.

### Trazabilidad

- Relaciona: `ADR-0001`, `.ai/core/CORE_MANIFEST.md`, `.github/workflows/core-guard.yml`
- PR afectado: #1 (`chore: .gitignore + blindaje de secretos`, OPEN, no mergeado)
