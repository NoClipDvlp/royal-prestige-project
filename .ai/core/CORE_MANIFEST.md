# CORE MANIFEST — El núcleo intocable

El **core** es el conjunto de archivos cuya modificación puede romper el proyecto entero
o invalidar supuestos de seguridad/datos. **Ni el Orquestador ni el Agente lo editan por
iniciativa propia.** Solo el humano (Nicolas) autoriza un cambio, caso por caso, con ADR.

## Por qué existe esta regla

La IA, tras muchas solicitudes, tiende a "mejorar" cosas que no debía tocar (alucinación
por exceso de iniciativa). El core blinda lo que sostiene todo lo demás. Si el core se
mueve sin control, los errores aparecen lejos de la causa y son carísimos de rastrear.

## Qué está en el core (rutas protegidas)

Ver lista exacta y ejecutable en `.coreignore`. En resumen:

| Ruta | Por qué es core |
|---|---|
| `db/schema.sql` / migraciones base | El modelo de datos es la verdad. Un cambio aquí afecta todo. |
| `lib/auth/**` | Seguridad. Un error aquí expone datos entre roles/distribuciones. |
| `lib/rbac/**` | Control de acceso por rol (Admin/Auditor/Distribuidor). Crítico. |
| `lib/rls-policies/**` | Reglas de aislamiento de datos por distribución. |
| `lib/calendar/sync-core.ts` | Motor de sync con Google. Un fallo genera conflictos. |
| `.ai/**` | Las reglas de gobernanza. No se auto-modifican. |
| `core/**` | Cualquier cosa marcada explícitamente como núcleo. |

> La lista viva y autoritativa es `.coreignore`. Esta tabla es solo explicación.

## Excepción única: cuando tocar el core es estrictamente necesario

Ejemplo legítimo: una integración core requiere cambiar una estructura para funcionar,
y no existe alternativa que la evite. En ese caso:

1. El **Agente PARA** y no escribe nada.
2. El Agente reporta al **Orquestador**: archivo, razón técnica, alternativas evaluadas,
   consecuencia de no hacerlo.
3. El Orquestador presenta al **humano** y pide aprobación explícita.
4. Con el "sí" del humano:
   - Se redacta un **ADR** (estado: aprobado, con la firma conceptual del humano).
   - El commit incluye el marcador `[CORE-APPROVED: ADR-XXXX]` en el mensaje.
   - El check de CI (`core-guard`) valida ese marcador. Sin él, bloquea el merge.

## Lo que NUNCA es válido

- ❌ "Lo cambié porque era más limpio / más eficiente."
- ❌ "Asumí que estaba bien tocarlo."
- ❌ Editar `.ai/**` para flexibilizar estas mismas reglas.
- ❌ Evadir el check de CI (renombrar, mover, o partir el cambio en commits).
