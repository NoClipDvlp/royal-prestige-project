# .ai — Sistema de gobernanza de IA para Royal Control

Este directorio es el **cerebro de reglas** del proyecto. Define cómo el Orquestador
(Claude Cowork) y el Agente (Claude Code) colaboran sin alucinar ni corromper el núcleo.

> **Regla raíz:** las instrucciones de este directorio tienen prioridad sobre cualquier
> impulso del modelo. Si un archivo aquí dice "no", el modelo no lo hace, sin importar
> lo razonable que parezca la excepción en el momento.

## Jerarquía de autoridad (orden de obediencia)

```
HUMANO (Nicolas)
   │  aprueba/veta. Única autoridad sobre /core.
   ▼
ORQUESTADOR (Claude Cowork)  ── prompts/orchestrator.md
   │  decide, redacta ADRs, NO escribe código.
   ▼
AGENTE (Claude Code)         ── prompts/agent.md
   │  analiza a fondo, escribe código, ejecuta. NO decide arquitectura solo.
   ▼
CÓDIGO
```

## Mapa de archivos — qué es cada cosa

| Archivo | Quién lo lee | Para qué |
|---|---|---|
| `prompts/orchestrator.md` | Claude Cowork | Reglas del que piensa y decide |
| `prompts/agent.md` | Claude Code | Reglas del que codea y analiza |
| `core/CORE_MANIFEST.md` | Ambos | Qué es intocable y por qué |
| `core/.coreignore` | CI + ambos | Lista exacta de rutas protegidas |
| `protocols/preflight.md` | Claude Code | Declarar supuestos ANTES de codear |
| `protocols/anti-hallucination.md` | Ambos | Reglas duras contra inventar |
| `protocols/adr-template.md` | Orquestador | Plantilla de toda decisión |
| `protocols/handoff.md` | Ambos | Formato de traspaso orquestador↔agente |
| `../docs/adr/` | Todos | Decisiones arquitectónicas registradas |
| `../docs/PROJECT_SPEC.md` | Todos | Verdad única del producto (MVP) |
| `../docs/DATA_MODEL.md` | Todos | Esquema de DB y reglas de datos |

## Cómo se instala (lee INSTALL.md en la raíz del repo)

- **Claude Code:** lee `CLAUDE.md` de la raíz automáticamente, que apunta aquí.
- **Claude Cowork:** pega el contenido de `prompts/orchestrator.md` en sus
  instrucciones base de la interfaz, Y comparte la carpeta (acceso al repo).

## Principio antialucinación de una línea

> Si no está escrito en `/docs` o en un ADR aprobado, **no es verdad**.
> Ante un hueco, se pregunta al humano. Nunca se rellena con un supuesto silencioso.
