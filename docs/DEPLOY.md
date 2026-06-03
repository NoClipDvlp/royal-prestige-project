# DEPLOY — Royal Control (Supabase + Vercel)

> Guía ejecutable para levantar el proyecto Supabase, aplicar el esquema y validar el vertical
> end-to-end (auth → tareas, con RLS en vivo). Avanza/cierra **DEBT-0006**. No toca `/core`.
>
> Convención de roles: el flujo de datos vive bajo **RLS**. La `service_role` key **nunca** va al
> cliente ni al repo (`.gitignore` ya cubre `.env*`). El **primer admin se asigna a mano** (no hay
> seed de admin — ver `db/seed/roles.sql`).

---

## 0. Prerrequisitos

- Cuenta de Supabase y de Vercel.
- Cuenta de Google Cloud (para OAuth).
- Node 22 + pnpm (para correr la app localmente).

---

## 1. Crear el proyecto Supabase

1. supabase.com → **New project**. Elige región cercana a Colombia (la app usa `APP_TIMEZONE = America/Bogota`).
2. Guarda la **DB password**.
3. En **Project Settings → API** anota:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → **SOLO uso server** (jobs/admin). NUNCA en el cliente ni en el repo.

---

## 2. Aplicar el SQL — EN ESTE ORDEN (importante)

En Supabase **no hay shim**: `auth.users`, `auth.identities` y `auth.uid()` los provee la plataforma
(GoTrue). Por eso aquí se aplican las migraciones reales directamente. El orden importa porque hay
ALTERs que dependen de objetos creados antes:

| # | Archivo | Por qué en este orden |
|---|---|---|
| 1 | `db/migrations/0000_init.sql` | Crea enums, tablas, constraints, índices, triggers y los helpers `auth.current_role()` / `auth.current_distribution()` + GRANTs. |
| 2 | `lib/rls-policies/policies.sql` | `ENABLE/FORCE RLS` + todas las policies. Debe ir **después** de 0000 (usa las tablas y los helpers). |
| 3 | `db/migrations/0001_auditor_labels.sql` | Crea la vista `users_labels` y **ALTERa `users_select`** (creada en el paso 2). |
| 4 | `db/migrations/0002_auth_profile.sql` | Triggers en `auth.users` / `auth.identities` (perfil al signup + sync de `auth_providers`). |
| 5 | `db/migrations/0003_tasks_engine.sql` | Columnas + `is_task_due` + `materialize_day` + triggers + **ALTERa `tasks_delete`** + (intenta) el schedule de pg_cron. |
| 6 | `db/migrations/0004_tasks_premium.sql` | Duración (`tasks`/`task_instances` + CHECK tope 22:00 **sin wrap de medianoche**) + RPC `tasks_due_on(d)` `SECURITY INVOKER`. **ALTERa** `tasks`/`task_instances` y crea la función → **después** de 0003 (ADR-0011). |
| 7 | `db/migrations/0005_metrics.sql` | Motor de métricas: `priority_weight`, `compliance_self` (`SECURITY INVOKER`), `compliance_ranking` (`SECURITY DEFINER` + gate de rol). Aditiva (solo funciones + grants) → **después** de 0004 (ADR-0012). |
| 8 | `db/seed/roles.sql` | Intencionalmente **sin INSERTs** (no hay categorías de fábrica ni admin hardcodeado). Puede omitirse; se incluye por completitud. |

**Vía A — SQL Editor (recomendado para la primera vez):** abre **SQL Editor**, y pega y ejecuta el
contenido de cada archivo **uno por uno, en el orden de la tabla**. (El SQL Editor corre como `postgres`,
con permisos sobre el esquema `auth` — necesario para los helpers del paso 1 y los triggers del paso 4.)

**Vía B — psql (CLI):** usa la connection string de **Settings → Database** (modo *session*):
```bash
PG="postgresql://postgres:<DB_PASSWORD>@db.<project-ref>.supabase.co:5432/postgres"
psql "$PG" -v ON_ERROR_STOP=1 -f db/migrations/0000_init.sql
psql "$PG" -v ON_ERROR_STOP=1 -f lib/rls-policies/policies.sql
psql "$PG" -v ON_ERROR_STOP=1 -f db/migrations/0001_auditor_labels.sql
psql "$PG" -v ON_ERROR_STOP=1 -f db/migrations/0002_auth_profile.sql
psql "$PG" -v ON_ERROR_STOP=1 -f db/migrations/0003_tasks_engine.sql
psql "$PG" -v ON_ERROR_STOP=1 -f db/migrations/0004_tasks_premium.sql
psql "$PG" -v ON_ERROR_STOP=1 -f db/migrations/0005_metrics.sql
```

**Vía C — consolidado idempotente (recomendada para re-aplicar / estado parcial):**
`docs/deploy/consolidated.sql` es un único archivo **re-ejecutable sin importar el estado** (corre 2 veces
sin error): usa `create … if not exists`, do-guards de enums, `create or replace trigger/view/function`,
`drop policy if exists` + `create`, `add column if not exists` y `drop constraint if exists` + `add`.
Pégalo entero en el SQL Editor. Es seguro aunque ya tengas migraciones aplicadas (p. ej. 0004 ya estaba y
falta 0005): añade lo que falte y no rompe lo existente (DEBT-0011). Refleja el mismo diseño que las
migraciones individuales; no las sustituye como verdad (la verdad sigue en `db/migrations/`, que es core).

> Cualquier cambio futuro a estas rutas es **core** (ver `.ai/core/.coreignore`): requiere ADR + commit
> `[CORE-APPROVED]`. Esta guía solo las *aplica*, no las modifica. El consolidado (`docs/deploy/`) es no-core.

---

## 3. Habilitar pg_cron y asegurar el schedule de materialización

El job diario crea las instancias de tareas de "hoy" (`materialize_day(app_today())`).

1. **Database → Extensions** → habilita **`pg_cron`** (y `pg_net` si Supabase lo pide).
2. ⚠ El bloque de `cron.schedule` en `0003_tasks_engine.sql` está **guardado** tras
   `if exists (select 1 from pg_extension where extname='pg_cron')`. Si habilitaste pg_cron **después**
   de correr 0003, el schedule **no se creó**. Soluciones (elige una):
   - **Re-ejecutar** solo ese bloque `do $$ ... $$;` final de `0003_tasks_engine.sql`, **o**
   - Crear el schedule a mano en el SQL Editor:
     ```sql
     select cron.schedule(
       'royal-control-materialize-day',
       '5 5 * * *',  -- 05:05 UTC = 00:05 America/Bogota (UTC-5, sin DST)
       'select public.materialize_day(public.app_today())'
     );
     ```
   - (Lo más limpio: habilitar pg_cron **antes** de correr 0003.)
3. Verifica que quedó programado:
   ```sql
   select jobname, schedule, command from cron.job;
   ```
4. (Opcional) materializa "hoy" una vez a mano para probar sin esperar al cron:
   ```sql
   select public.materialize_day(public.app_today());
   ```

---

## 4. Google OAuth

1. **Google Cloud Console** → APIs & Services → **Credentials** → *Create OAuth client ID* (Web).
   - **Authorized redirect URI:** `https://<project-ref>.supabase.co/auth/v1/callback`
   - Copia **Client ID** y **Client secret**.
2. **Supabase → Authentication → Providers → Google:** pega Client ID + Secret y habilita.
3. **Supabase → Authentication → URL Configuration:**
   - **Site URL:** la URL de la app (local `http://localhost:3000`, prod la de Vercel).
   - **Redirect URLs (allow-list):** añade `<site>/auth/callback` (local y prod).
   El flujo es: Google → Supabase (`/auth/v1/callback`) → la app (`/auth/callback`, que hace
   `exchangeCodeForSession`).

---

## 5. Confirmación de email obligatoria (ADR-0006)

**Supabase → Authentication → Providers → Email** → activa **Confirm email**. Así el signup no crea
sesión hasta confirmar (la app ya muestra "Revisa tu email" tras registrarse). Configura las plantillas
de **Confirm signup** y **Reset password** si quieres personalizarlas; sus enlaces deben apuntar al
flujo `/auth/callback` (recovery → `?next=/auth/reset?mode=update`).

---

## 6. Variables de entorno

**Local (`.env.local`, ya gitignored):**
```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
# Server-only (panel admin: alta/reset de usuarios vía API admin de GoTrue). NO lleva prefijo NEXT_PUBLIC.
SUPABASE_SERVICE_ROLE_KEY=<service-role-secret-key>
```
**Vercel (Project → Settings → Environment Variables):** las dos `NEXT_PUBLIC_*` (Production + Preview)
**y** `SUPABASE_SERVICE_ROLE_KEY` como variable **server-only** (sin prefijo `NEXT_PUBLIC` → no se expone al cliente).

⚠ La **`service_role` / "secret key"** de Supabase: SOLO server-side. La usa `lib/supabase/admin.ts`
(marcado `import "server-only"`) desde server actions GATEADAS por `assertCallerIsAdmin()`. **Bypasea la RLS**
→ trátala como la llave maestra: NUNCA `NEXT_PUBLIC_*`, nunca en el cliente, nunca en el repo (`.env*` ya está
gitignored). La `anon key` (pública) es la única que va al navegador.

---

## 7. Primer admin (manual) y asignación de distribuidores

No hay admin sembrado. Tras desplegar:

1. **Regístrate** en la app (`/signup`) y **confirma el email**.
2. Hazte **admin** (SQL Editor). ⚠ **DEBT-0010:** el trigger `trg_users_no_priv_esc`
   (`forbid_self_privilege_escalation`) bloquea cambiar `role` desde **SQL directo** (sin sesión de app →
   `auth.uid()` null ≠ admin). Desactívalo **solo** durante este bootstrap del primer admin:
   ```sql
   alter table public.users disable trigger trg_users_no_priv_esc;
   update public.users set role = 'admin' where email = '<tu-email>';
   alter table public.users enable trigger trg_users_no_priv_esc;
   ```
   (Admin lleva `distribution_id = null`; el CHECK `rol↔distribución` lo exige.)
   > Las asignaciones de rol POSTERIORES las hace el admin desde el **panel** (con su sesión → el trigger
   > NO las bloquea), no por SQL directo. Solo este primer admin requiere el workaround.

Para **probar tareas** necesitas un **distribuidor** (la acción `createTask` exige `role='distributor'`
con `distribution_id`). El admin crea la distribución y asigna:
```sql
-- 1) crear la distribución (el nombre deseado quedó en users.preferences->>'desired_distribution')
insert into public.distributions (name) values ('Distribución A') returning id;

-- 2) asignar a un usuario ya registrado+confirmado como distribuidor de esa distribución
--    (mismo workaround DEBT-0010 si se hace por SQL directo; o hazlo desde el panel admin con sesión)
alter table public.users disable trigger trg_users_no_priv_esc;
update public.users
  set role = 'distributor', distribution_id = '<id-de-la-distribución>'
  where email = '<email-del-distribuidor>';
alter table public.users enable trigger trg_users_no_priv_esc;
```
> CHECK rol↔distribución: `distributor ⇒ distribution_id NOT NULL`; `admin/auditor ⇒ NULL`.
> Un `auditor` se asigna con `role='auditor'` (sin distribución).
> Una vez exista el **panel admin**, estas asignaciones se hacen desde la app (sesión admin) sin tocar el trigger.

---

## 8. Validación END-TO-END (marca al ejecutar)

**Onboarding / auth**
- [ ] Signup (nombre + nombre de distribución + email + password) → muestra "Revisa tu email".
- [ ] Llega el email de confirmación → al abrir el enlace, entra (vía `/auth/callback`).
- [ ] Login con email/password funciona; "Continuar con Google" funciona (si configuraste OAuth).
- [ ] Usuario recién confirmado (sin rol) → ve **"Contáctate con tu administrador"** (`/sin-rol`) y nada más.
- [ ] Tras `update ... role='admin'`, ese usuario entra al panel.

**Tareas (como DISTRIBUIDOR)** — crea/asigna un distribuidor (paso 7) y entra con él
- [ ] **Crear tarea** (alta rápida: título + hora 8–22 + recurrencia) → aparece en el día de **hoy**
      (la materializa el trigger de alta).
- [ ] Marcar estado **0 / 50 / 100** y que persista al recargar.
- [ ] **Editar una recurrente** → popup con los 3 scopes:
      *Solo este día* / *Este y los siguientes* / *Toda la serie* → cada uno deja el estado esperado.
- [ ] **Soft-delete** (borrar) una tarea → desaparece del listado; su historial de instancias permanece.
- [ ] (Si dejaste el cron correr a las 00:05 Bogotá, o corriste `materialize_day` a mano) las tareas
      `daily` aparecen al día siguiente, **nacen en 0** (sin arrastre).

**Aislamiento RLS en vivo (lo más crítico)**
- [ ] Crea un **2º distribuidor en OTRA distribución** (paso 7, otra distribución).
- [ ] Logueado como el 2º distribuidor, **NO** ves las tareas/instancias del 1º.
- [ ] (Si tienes un **auditor**) ve métricas/labels pero **no** la tabla `users` cruda ni `tasks` (sin PII, sin drill-down).
- [ ] Un usuario **sin rol** no lee ninguna tabla de negocio (solo su propia fila en `users`).

---

## Notas / deudas relacionadas

- **DEBT-0006** (este deploy): proyecto Supabase + `pg_cron`. Al completar 1–8, queda **cerrada**.
- **DEBT-0001 ítem 1** (billing de GitHub Actions): sigue abierto — el `core-guard` no corre hasta
  desbloquearlo. Conviene resolverlo **antes** de escribir más core.
- **DEBT-0005** (repo en carpeta sincronizada): ✅ **CERRADA** (2026-06-03, re-clone a ruta no sincronizada).
- **DEBT-0007** (atomicidad de "este y los siguientes" / "este día futuro"): post-MVP salvo que se
  observe inconsistencia.
- Las **migraciones y la RLS son core**: cualquier cambio futuro va por ADR + `[CORE-APPROVED]`.
