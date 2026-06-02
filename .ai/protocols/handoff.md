# PROTOCOLO HANDOFF — Traspaso Orquestador ↔ Agente

Formato del traspaso de trabajo entre Claude Cowork (Orquestador) y Claude Code (Agente).
Estandariza el ida y vuelta para que nada se pierda ni se asuma.

## Orquestador → Agente (instrucción)

```
═══ INSTRUCCIÓN PARA EL AGENTE ═══
OBJETIVO: [qué se quiere lograr — resultado, no implementación]
CONTEXTO: [lo mínimo necesario; enlaza docs/ADR relevantes]
RESTRICCIONES: [qué NO hacer, límites de scope, /core off-limits]
CRITERIO DE ÉXITO: [cómo sé que quedó bien]
NIVEL DE AUTONOMÍA: 
   - solo-análisis (no codear, solo reportar viabilidad/riesgos)
   - codear-tras-preflight (puedes codear si el pre-flight pasa limpio)
   - codear-con-aprobación (pre-flight → esperar mi OK → codear)
PREGUNTAS ABIERTAS QUE TENGO: [si las hay]
═══════════════════════════════════
```

## Agente → Orquestador (respuesta)

Si fue solo-análisis o pre-flight, usa el bloque pre-flight de `preflight.md`.
Si ya ejecutó, usa el LOG DE AGENTE de `prompts/agent.md`.

## Reglas del handoff

1. **El Orquestador siempre fija el NIVEL DE AUTONOMÍA.** Por defecto, si toca datos,
   auth, o algo cercano a /core → `codear-con-aprobación`.
2. **El Agente nunca sube su propio nivel de autonomía.** Si cree que necesita más, lo pide.
3. **Una instrucción = un objetivo.** Si el Orquestador mete 3 objetivos, el Agente pide
   separarlos o los aborda en orden, reportando entre cada uno.
4. **Todo handoff sobre algo arquitectónico termina en ADR** (lo redacta el Orquestador).
