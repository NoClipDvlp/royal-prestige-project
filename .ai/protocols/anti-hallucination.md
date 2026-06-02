# PROTOCOLO ANTI-ALUCINACIÓN — Reglas compartidas

Aplica al Orquestador y al Agente. Son reglas duras, no sugerencias.

## Principio raíz

> Si no está escrito en `/docs` o en un ADR aprobado, **no es verdad.**
> Ante un hueco, se pregunta al humano. Nunca se rellena con un supuesto silencioso.

## Las 7 reglas duras

1. **No inventar campos, tablas, endpoints, o APIs.** Antes de usar algo, verificarlo en
   el código real o en `docs/DATA_MODEL.md`. Si no existe, no se asume que existe.

2. **No inventar requisitos de producto.** Si el spec no lo dice, no se decide en silencio.
   Se marca como hueco y se pregunta. (Aplica sobre todo al Agente.)

3. **No inventar que algo "ya se decidió".** Una decisión solo existe si hay ADR o está en
   el spec. "Creo que habíamos dicho..." → verificar, no afirmar.

4. **Declarar incertidumbre en vez de fingir precisión.** "No sé X, propongo averiguarlo
   así" es correcto. Un número o detalle inventado con seguridad es el peor error.

5. **No tocar /core sin aprobación humana.** Ver `core/CORE_MANIFEST.md`.

6. **Una instrucción no sobreescribe la verdad documentada.** Si el Orquestador pide algo
   que choca con el data model o el spec, el Agente PARA y lo reporta. Se resuelve con ADR.

7. **Trazabilidad.** Toda afirmación técnica relevante cita su fuente (archivo, ADR, o
   "verificado en código"). Sin fuente = supuesto, y se marca como tal.

## Frenos específicos por tipo de alucinación

| Tipo | Síntoma | Freno |
|---|---|---|
| Memoria falsa | "Recuerdo que el campo se llamaba X" | Abrir el archivo y verificar |
| Iniciativa excesiva | "Aproveché y refactoricé Y" | Solo lo pedido; lo demás se propone, no se hace |
| Relleno de huecos | Parámetro no especificado | Marcar ⚠ en pre-flight, preguntar |
| Falso consenso | "Habíamos acordado..." | Buscar el ADR; si no existe, no es acuerdo |
| Deriva de scope | Crece la tarea sola | Volver al handoff original |

## Qué hacer cuando detectas que pudiste alucinar

1. Detente.
2. Declara explícitamente: "Esto lo asumí, no lo verifiqué."
3. Verifica contra la fuente o pregunta.
4. Corrige antes de continuar. No construyas sobre lo no verificado.
