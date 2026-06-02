# PROJECT SPEC — Royal Control (MVP)

> **Verdad única del producto.** Si algo no está aquí o en un ADR, no está decidido.
> Software propiedad de **Royal Prestige** (logo de marca siempre presente).

---

## 1. Qué es

Panel de control de actividad diaria, semanal y mensual para distribuidores de Royal
Prestige. Un "to-do" de procesos: el usuario organiza tareas por hora, registra su
cumplimiento, y ve métricas de su desempeño en el tiempo.

## 2. Regla de oro y de plata

- **Oro:** menos clicks, más control de procesos, más productividad. Crear una tarea
  diaria debe tomar **< 1 minuto**.
- **Plata:** interfaz simple, lógica robusta. Cero configuración inicial tipo Notion.
  El usuario final batalla hasta con Excel — si algo necesita explicación, necesita
  popup guía o necesita simplificarse.

## 3. Roles (MVP)

| Rol | Puede |
|---|---|
| **Admin** | CRUD total, métricas globales, crear usuarios, asignar roles, reset de contraseñas, crear categorías globales. Acceso a todo. |
| **Auditor** | Audita TODAS las distribuciones. Métricas generales de cada distribuidor. **NO tiene CRUD de distribuidores** (política de seguridad). |
| **Distribuidor** | CRUD de sus tareas, métricas propias, calendario. Puede asignar tareas a sus JD y Vendedores (post-MVP, pero el modelo lo soporta). Control total sobre vistas. |

### Roles post-MVP (el esquema nace preparado, la lógica NO se construye aún)
- **JD (Distribuidor Junior):** varios por distribución; pertenece a una sola distribución.
- **Vendedor:** varios por JD; puede colgar de un JD o directamente de la distribución.
  Si está bajo un JD, sale de la responsabilidad operativa del Distribuidor, pero el
  Distribuidor mantiene **visibilidad (solo lectura)** sobre el JD y sus Vendedores.

## 4. Estructura organizacional (confirmada)

- Una **Distribución** tiene **N Distribuidores**.
- Una **Distribución** tiene **hasta 3 owners** (relación de propiedad, no un rol nuevo).
  Un usuario con rol Distribuidor puede o no ser owner.
- Un Distribuidor pertenece a **una sola** distribución.
- El Auditor audita todas las distribuciones (no se le asignan específicas).

## 5. Registro y acceso

- Registro **libre** (signup público) con: email/teléfono + contraseña, o login con Google.
  Un usuario puede tener **ambos métodos** vinculados.
- El **teléfono es solo identificador**; la clave es siempre contraseña (sin OTP en MVP).
- Tras registrarse, si el Admin **no le asigna rol**, el usuario ve únicamente una
  pantalla: *"Contáctate con tu administrador para que te asigne una licencia o rol."*
  No ve absolutamente nada más.
- **Sesiones múltiples permitidas** (login activo en varios dispositivos a la vez).
- **Reset de contraseña:** lo puede hacer el Admin y el propio usuario vía email.

## 6. Inputs de usuario

Distribuidor: nombre, nombre de distribución, foto del distribuidor, logo de distribución,
contraseña, email/teléfono de registro, login con Google.
Auditor: igual, pero sin asignación a una distribución.

## 7. Tareas (motor)

- Franja horaria default **8am–10pm**. Editable solo por **preferencias del usuario logueado**
  (no es global). El Admin define el default global.
- Una hora puede contener **varias tareas**. No hay límite de tareas por día; si hay
  muchas, la UI simplifica/colapsa la vista.
- **Recurrencia:** una tarea puede ser de un solo día, diaria, semanal o mensual.
- **Estado cerrado:** solo `0%`, `50%`, `100%`. No hay valores intermedios.
- Tarea no tocada al final del día → **queda pendiente con el % que tenga** (0% si no se tocó).
- **Recurrente:** cada instancia diaria **nace en 0%**. Se conserva el **registro histórico**
  de que la instancia anterior quedó incompleta. NO se arrastra el estado entre días.
- **Editar una recurrente** dispara un popup de elección estilo Google Calendar:
  *solo este día* / *este y los siguientes* / *toda la serie*.
- **Asignación:** una tarea puede ser autoasignada o asignada por un superior. Toda tarea
  cuenta **igual** para el % de cumplimiento. Se guarda `origen: self | superior` como
  metadato filtrable (no afecta el cálculo).
- **Categorías:** el Admin crea categorías **globales** (aparecen como default a todos).
  El usuario puede crear **categorías personalizadas** propias.

## 8. Métricas / KPIs

- **% de cumplimiento** diario, semanal, mensual. Calculado sobre los estados (0/50/100),
  **ponderable por prioridad** de la tarea (no por duración — son to-dos, no proyectos).
- Conteo de tareas hechas / a medias / no hechas.
- **Snapshots** históricos: mensual y trimestral (máximo). No recálculo en vivo del histórico.
- Auditor/Admin ven **métricas comparativas entre distribuidores** (ranking).
- Toda métrica y toda creación de tarea tiene **vista compacta** y **vista ampliada**
  (el usuario elige; mejora la productividad sin perder detalle).

## 9. Calendario

- **Google Calendar (mixto: login + calendario, scopes correspondientes):**
  sincronización **solo push** (app → Google). Cambios hechos en Google **no** se
  sincronizan de vuelta, para evitar conflictos.
- Si el usuario borra el evento en Google → se marca **conflicto** y aparece una **alerta
  de sincronización**; el usuario elige si re-sincronizar o no.
- **Calendario nativo:** diseño premium, reconoce claramente el día actual. Si el usuario
  no conecta Google, ve igualmente su calendario nativo sincronizado con sus pendientes.
  Vistas: **día / semana / mes**.

## 10. Alertas / Notificaciones

- MVP: **push web**. Post-MVP: WhatsApp.
- Formato **resumen** (ej. "tienes 3 pendientes hoy"), no una notificación por tarea
  (evita spam que vuelve la herramienta inútil).
- **Una sola fuente manda** la notificación (app o Google, nunca ambas) — sin doble aviso.

## 11. UI / UX (requisito, no adorno)

- Estética premium, **no** "vibe". Colores **pasteles y neutros**, tonos premium.
- **Bordes blancos + sombra flotante** (elemento flotante). **Sin bordes de colores.**
- Efectos de **vidrio** (glassmorphism). Modo **claro y oscuro**, conmutable por el usuario.
- **Header estilo app iOS** — sensación de aplicación, no de dashboard corporativo.
- **Logo de Royal Prestige** siempre presente. El logo de la distribución se configura
  desde Admin.
- **Saludo de bienvenida estilo Apple** en el dashboard:
  *"Hola [nombre], buen[os/as] [días/tardes]. Vas en [X]% de tu meta semanal — te faltan
  [N] pendientes."* El dato que se muestra es el que más mueve la aguja (progreso hacia
  meta semanal), no un conteo plano.
- Popups de uso y guías para onboarding sin fricción.

## 12. Fuera del MVP (Tier 4 — el esquema se prepara, la lógica no se construye)

- Lógica de roles JD y Vendedor.
- Sincronización bidireccional con Google Calendar.
- Notificaciones por WhatsApp.

---

**Score del spec:** 4.7 / 5.0 — Capa 0 validada, sin contradicciones abiertas al cierre.
