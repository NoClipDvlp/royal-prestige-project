# Discovery v2 — CRM de Demostraciones, Clientes y Catálogo

> Documento de Orquestador. NO es un plan de implementación ni un ADR. Es el mapa del terreno,
> el banco de preguntas y la tesis de arquitectura **antes** de cualquier decisión técnica.
> Insumo: `docs/externos/control de procesos royal.xlsm` (CRM real con macros) +
> `PVP_RoyalPrestige_2025_dataset.xlsx` (catálogo). Fecha: 2026-06-04.

---

## 0. La conclusión primero (para no perder el hilo)

Tu Excel maestro **ya es** un CRM de venta directa completo. No estamos "añadiendo un calendario":
estamos digitalizando el proceso comercial entero de Royal Prestige. El riesgo que tú mismo nombraste
—que se vuelva un jeroglífico que nadie usa— es **real y es el problema central de diseño**, no un
detalle. El Excel falló no por falta de campos, sino por exceso: pide 25 columnas de golpe.

**La tesis que propongo (y que hace o rompe esta v2):**

> El CRM no es una pantalla aparte del to-do. **El CRM es la fuente; el to-do es su proyección
> accionable.** Una demo agendada *es* una tarea en el calendario del vendedor. Un referido sin llamar
> *es* una tarea "Llamar a Pedro". La `PROXIMA_ACCION` del embudo *se materializa* como tarea/alerta.
> El vendedor de afán nunca ve un formulario de 25 campos: ve "Demo 3pm — Olga, Cra 80" y un botón
> "completar". El dato rico vive detrás; la superficie es el to-do que ya construimos.

Si logramos eso, no es un Excel más: es la única herramienta que les ahorra trabajo en vez de
duplicarlo. Si no, será reemplazada por una libreta. Todo el documento gira alrededor de defender esa tesis.

---

## 1. El dominio, mapeado desde tus archivos reales

### 1.1 Entidades (fuente: hojas del .xlsm)

| Entidad | Rol | Campos núcleo (del Excel) |
|---|---|---|
| **Cliente** (`Maestro_Clientes`) | Fuente de verdad, 4 bloques | identidad (nombre/dir/tel/email/fuente), demo (fecha/vendedor/interés/asistió), cierre (resultado/producto/monto), trazabilidad (fase/bloqueo/próxima_acción/intentos/referidos) |
| **Demo** (`Demos`) | Cada demostración | cliente, vendedor, fecha_agendada, fecha_realizada, estado, duración, interés 1-5, referidos_generados, ¿compró?, monto, stand |
| **Referido** (`Referidos`) | Hijo de un cliente | referidor, nombre/tel/dir, fuente, dedicación, interés, fase (5), vendedor_asignado, resultado, monto, **id_cliente_promovido** |
| **Telemarketing** (`Telemarketing`) | Historial de contactos | cliente, fecha/hora, operador, resultado, próxima_acción, nueva_fecha |
| **Vendedor** (`Vendedores`) | Equipo comercial | código, nombre, tel, email, stand_asignado, estado |
| **Producto** (`Catalogo_PVP`) | 133 SKUs | código, categoría, descripción, PVP COP/USD, premium, estado |
| **Catálogos** (`Catalogos`) | Listas de validación | stands, fuentes de prospecto, **fases**, bloqueos, próximas_acciones |

### 1.2 El embudo es una máquina de estados (esto es lo importante)

El campo `FASE_ACTUAL` + `BLOQUEO_ACTUAL` + `PROXIMA_ACCION` codifica un pipeline:

```
1-Captura ──► 2-Telemarketing ──► 3-Demo Agendada ──► 4-Demo Realizada ──► 5-Cierre
   (buzón/stand)   (llamar)          (confirmar)         (resultado+interés)   (venta / no venta)
       │               │                  │                    │                    │
   bloqueo:        bloqueo:           bloqueo:             genera REFERIDOS ◄────────┘
   ninguno      no contesta/...    reagendar/...               │
                                                               ▼
                                              cada referido entra como NUEVO prospecto en Fase 1
```

Cada estado tiene una **próxima acción** explícita ("Llamar para agendar demo", "Confirmar asistencia",
"Llamar para cierre"). **Esa próxima acción es, literalmente, la tarea del día del comercial.** Aquí es
donde el CRM y el to-do se fusionan.

### 1.3 El ciclo de referidos es un grafo recursivo

Un cliente que compró (o no) genera N referidos → cada referido corre su propio embudo → si compra, se
**promueve a cliente** (`ID_CLIENTE_PROMOVIDO`) → y genera sus propios referidos. Es un **árbol de
crecimiento viral**. El Excel lo aplana en una hoja; nosotros podemos modelarlo como grafo real
(referidor → referidos) y eso habilita inteligencia que el Excel nunca pudo: *qué prospección/stand
genera más árbol*, *quién es un "súper-referidor"*, *ROI por origen*.

### 1.4 Catálogo + reglas comerciales (fuente: .xlsx)

133 productos en categorías (Cocina, Cuchillería, Electrodomésticos, etc.), PVP en COP/USD. Y unas
**Reglas Comerciales** que son la semilla del post-MVP de negociación: TRM, **descuento máx contado 5%**,
**bono máx en ventas >$3M = 20%**. Eso confirma tu visión de "la app hace las matemáticas de la venta".

---

## 2. La tesis de arquitectura (cómo NO ser un Excel jeroglífico)

Tres principios de diseño, en orden de importancia:

### 2.1 Captura progresiva (el antídoto al jeroglífico)
El Excel pide todo de golpe. La app captura **solo lo del momento**, y el registro se enriquece a lo
largo del embudo:
- **Agendar demo** (Fase 3) = 5 campos: cliente, fecha, hora, dirección, asesor. (Tu "demo rápida".)
- **Resultado** (Fase 4) = se captura *después*, el día de la demo: asistió, interés 1-5, ¿compró?, referidos.
- **Cierre** (Fase 5) = producto + monto, solo si compró.

Nunca 25 campos en una pantalla. Cada fase, 3-5 campos máximo, y la mayoría **clicks, no escritura**
(interés = 5 estrellas; resultado = 3 botones; producto = picker del catálogo).

### 2.2 El CRM genera el to-do (la fusión)
La `PROXIMA_ACCION` de cada cliente/referido/demo **se materializa como tarea** en el motor que ya
tenemos. "Llamar a Pedro para agendar" aparece en el to-do del vendedor con su hora. Una demo agendada
es un bloque en su día. Una demo cuya hora ya pasó sin completar dispara la alerta que pediste ("David,
no olvides completar tu demostración"). **Reusamos el motor de tareas/recurrencia/alertas existente** —
el CRM solo alimenta su cola.

### 2.3 Configurable por el dueño del proceso (no-dependiente-de-dev)
Igual que el admin ya configura **plantillas de tareas** y **categorías**, debe poder configurar
**campos de formulario** y **productos**. Mismo principio, misma filosofía. Es la diferencia entre un
software que se entrega y uno que hay que mantener. *(Pero ver §4: es el mayor cuello de botella.)*

---

## 3. Banco de preguntas (decisiones de producto, antes de cualquier ADR)

Agrupadas. No respondas todas ahora — son el orden del día de las próximas sesiones.

### A · Modelo de cliente y propiedad
- **A1.** ¿El cliente "pertenece" a un usuario (el que lo captó) o a la distribución? Cuando un
  distribuidor delega una demo a su vendedor, ¿el vendedor *ve* al cliente completo, o solo la demo?
- **A2.** Sin base maestra, cada quien agrega clientes → **¿deduplicación?** ¿Por teléfono? ¿Qué pasa si
  dos vendedores captan a la misma persona en dos buzones distintos?
- **A3.** ¿Un cliente puede ser de varios distribuidores a la vez, o es exclusivo (territorio)?

### B · Embudo y delegación jerárquica
- **B1.** ¿Replicamos las 5 fases exactas del Excel, o las simplificamos? ¿El admin puede editar las fases
  (vuelve a §2.3 configurable)?
- **B2.** Delegación: distribuidor→JD→vendedor; vendedor agenda pero no delega. ¿Cómo se ve esto?
  ¿El que delega sigue viendo el resultado? ¿Hay "reasignación"?
- **B3.** La jerarquía JD/vendedor **hoy no existe** en el modelo (solo el enum de rol). Hay que construir
  el modelo de equipos/jerarquía. ¿Un vendedor pertenece a un JD que pertenece a un distribuidor? ¿Árbol fijo?

### C · Demos, mantenimientos y captura
- **C1.** Demo y mantenimiento comparten campos. ¿Qué los diferencia realmente? ¿Mantenimiento = demo sobre
  cliente existente que puede recomprar/referir? ¿O flujos distintos?
- **C2.** Campos de la "demo rápida" que diste: asesor, cliente, tel, hora, fecha, dirección, referido_de,
  cuántas personas, agendado_por, llevar_obsequio. ¿Cuáles son **obligatorios** para agendar y cuáles se
  completan después?
- **C3.** ¿Quién captura el resultado de la demo y cuándo? ¿El vendedor desde el móvil al terminar?

### D · Referidos
- **D1.** ¿El referido es una entidad propia (como en el Excel) o simplemente un cliente en Fase 1 con un
  campo "referido_por"? *(Recomiendo lo segundo: unifica el embudo y simplifica.)*
- **D2.** ¿Hasta qué profundidad rastreamos el árbol? ¿Importa el nivel para premios/comisiones?
- **D3.** El premio por 10 referidos *si compran*: ¿la app lo trackea? ¿es MVP o post?

### E · Catálogo, ventas y dinero
- **E1.** Catálogo en MVP = solo lectura (picker en la venta) ¿o el admin lo gestiona (CRUD)?
- **E2.** ¿La venta registra producto + monto en MVP? ¿Los descuentos/bonos (reglas comerciales) son MVP o
  post? *(Recomiendo: monto+producto sí; calculadora de descuentos/bonos post-MVP.)*
- **E3.** ¿Métricas de venta (montos, conversión, ROI por stand/fuente) entran a las métricas que ya tenemos?

### F · Formularios configurables (el grande)
- **F1.** ¿MVP o post-MVP? Un form-builder real es un sub-producto. *(Mi recomendación fuerte: MVP arranca
  con campos FIJOS bien diseñados; el form-builder configurable es v2.1. Ver §4.2.)*
- **F2.** Si va: ¿el admin agrega campos a *qué* entidades (cliente, demo)? ¿Qué tipos (texto, número,
  select, fecha)? ¿Los campos custom entran a las métricas?

### G · Operación de campo
- **G1.** El vendedor en un stand/demo puede no tener internet. **¿Captura offline?** (PWA con cola de
  sincronización.) ¿MVP o post?
- **G2.** Migración: ¿importamos los clientes reales del Excel actual, o se empieza de cero?

---

## 4. Cuellos de botella y riesgos (priorizados por amenaza)

| # | Cuello de botella | Severidad | Por qué amenaza el core |
|---|---|---|---|
| 1 | **Tensión simplicidad ↔ riqueza de datos** | 🔴 Crítica | Es *el* problema. Mitigación: captura progresiva + CRM-genera-to-do (§2). Si esto falla, falla la v2. |
| 2 | **Formularios configurables = sub-producto** | 🔴 Alta | Un form-builder con storage flexible (JSONB/EAV), validación dinámica y métricas sobre campos custom es enorme. Riesgo de tragarse el MVP. Recomiendo diferirlo. |
| 3 | **Jerarquía JD/vendedor inexistente hoy** | 🟡 Media-alta | Hay que construir el modelo de equipos + extender la RLS de "self/distribución" a "mi cadena jerárquica". Toca `/core` (RLS). ADR dedicado. |
| 4 | **Propiedad de clientes + delegación cruzada** | 🟡 Media-alta | ¿Quién ve qué cliente cuando se delega? Es RLS jerárquica + reglas de negocio. Datos sensibles (clientes = activo del negocio). |
| 5 | **Clientes sin deduplicación** | 🟡 Media | Datos sucios desde el día 1. Mitigación: match por teléfono al crear + aviso de posible duplicado. |
| 6 | **Árbol de referidos recursivo** | 🟢 Media-baja | Modelable como self-FK; la UX del árbol es post-MVP. En MVP basta "referido_por". |
| 7 | **Offline/campo (PWA + sync)** | 🟡 Media | Si el vendedor no puede agendar sin señal, vuelve a la libreta. Evaluar pronto. |
| 8 | **Migración del Excel real** | 🟢 Baja | Import único; los datos están estructurados. Bajo riesgo. |

---

## 5. Fasificación propuesta (realista con los tiempos)

Antes: **lanzar a producción la fase actual (to-do + métricas + plantillas + pulido) sin nada de esto.**
Acordado. Lo de abajo es la **v2**, en sub-versiones para no repetir el error del Excel (todo de golpe).

**v2.0 — el núcleo del CRM que se siente como to-do** *(score de foco: 4.7)*
- Catálogo de productos (import del xlsx → tabla; lectura + CRUD admin básico).
- Clientes (CRUD por dueño, dedup por teléfono con aviso).
- Demos y mantenimientos con **captura progresiva** (agendar rápido → completar resultado después).
- **Cada demo/próxima-acción se materializa como tarea/alerta** en el motor actual (la fusión §2.2).
- Embudo con fases + próxima acción (fijas en v2.0).
- Delegación según jerarquía (requiere el modelo de equipos + RLS jerárquica — ADR core).
- Referido como cliente en Fase 1 con `referido_por` (sin árbol visual aún).
- *Qué se borra de v2.0:* form-builder, calculadora de descuentos, árbol de referidos visual, dashboard PowerBI, offline.

**v2.1 — inteligencia y configurabilidad**
- Formularios configurables (form-builder) — el "no-dependiente-de-dev" real.
- Calculadora de venta (catálogo + descuentos/bonos de las reglas comerciales).
- Árbol de referidos + métricas de ROI por stand/fuente, súper-referidores.
- Telemarketing como módulo (cola de llamadas).

**v2.2+ — la app experta**
- Catálogo con fotos, negociación asistida en demo, BI comercial completo, offline/PWA de campo.

---

## 6. Lo que recomiendo como próximo paso

1. **No diseñar v2 entera ahora.** Primero cerrar y lanzar a producción la fase actual (es la base estable).
2. Para v2, **empezar por la columna vertebral**: el modelo de datos (cliente/demo/embudo) + la **fusión
   CRM→to-do** (§2.2), que es la apuesta de producto. Eso merece su propio ciclo de discovery técnico con
   el Agente (¿cómo se materializa una demo como tarea sin duplicar el motor?).
3. **La jerarquía JD/vendedor + RLS jerárquica** es el primer trozo `/core` y conviene un ADR temprano,
   porque casi todo lo demás (delegación, propiedad de clientes, métricas por equipo) depende de ella.
4. Responder primero el **bloque A (propiedad de clientes)** y **B (jerarquía/delegación)** del banco de
   preguntas — son los que desbloquean el modelo de datos.

> Mi consejo de Orquestador, sin rodeos: la v2 es más grande que todo lo que llevamos. Su éxito no
> depende de cuántos campos del Excel repliquemos, sino de **defender la simplicidad bajo presión de
> riqueza de datos**. Cada vez que dudemos, la pregunta es: *"¿esto le ahorra trabajo a un vendedor de
> afán, o se lo añade?"*. Si se lo añade, va detrás (captura progresiva) o se difiere. Esa disciplina es
> lo único que evita construir el Excel jeroglífico otra vez, ahora en web.
