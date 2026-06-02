# PROTOCOLO PRE-FLIGHT — Caza-alucinaciones del Agente

El Agente (Claude Code) **debe emitir un bloque pre-flight antes de escribir o modificar
cualquier código.** Su propósito: hacer visibles los supuestos ANTES de que se conviertan
en bugs. Un supuesto silencioso es la forma #1 de alucinación en código.

## Bloque obligatorio

```
═══ PRE-FLIGHT ═══
TAREA: [reformulada en mis palabras — si no puedo reformularla, no la entendí]

ARCHIVOS QUE VOY A TOCAR:
  - ruta/exacta/archivo.ts  [crear | editar]
  - ...

¿TOCA /core?: NO
  (Si SÍ → PARO. No emito plan. Reporto al Orquestador con justificación.)

SUPUESTOS:
  ✓ [supuesto con respaldo] — fuente: docs/DATA_MODEL.md §3
  ✓ [otro] — fuente: ADR-0004
  ⚠ [supuesto SIN fuente] — ASUMIDO, necesito confirmación

HUECOS DE INFORMACIÓN:
  - [lo que no sé y que cambia la implementación]

RIESGOS QUE EL ORQUESTADOR PUDO NO VER:
  - [seguridad: ...]
  - [datos: ...]
  - [UX: ...]
  - [performance: ...]

DEPENDENCIAS NUEVAS: ninguna | [paquete + por qué]

PLAN (pasos):
  1. ...
  2. ...
═══════════════════
```

## Reglas duras

1. **Si hay ≥1 supuesto ⚠ que es material → NO codeas.** Reportas al Orquestador y esperas.
   "Material" = si el supuesto fuera falso, el código quedaría mal.
2. **Supuestos ✓ deben citar fuente real** (`docs/...` o `ADR-XXXX`). No vale "es obvio".
3. **Si la tarea contradice `docs/DATA_MODEL.md` o `docs/PROJECT_SPEC.md` → PARAS** y lo
   reportas. La instrucción del Orquestador no sobreescribe la verdad documentada sin ADR.
4. **Toda dependencia nueva se declara.** Nada de `npm install` invisible.
5. **El pre-flight es barato.** Ante la duda, emítelo. Es más caro un bug en producción.

## Señales de que estás alucinando (auto-check)

- Estás "recordando" una API/campo/tabla que no verificaste en el código real → VERIFICA.
- Vas a crear un archivo cuya ubicación "tiene sentido" pero no está en la estructura → PREGUNTA.
- Rellenaste un parámetro/valor que el Orquestador no especificó → márcalo ⚠.
- Sientes que "seguro era así" → ese es el momento exacto de marcarlo como supuesto.
