-- 0012_weekly_multiday.sql — ADR-0019: recurrencia semanal multi-día (estilo Google Calendar).
--
-- `weekly` gana un conjunto de días: weekdays smallint[] (1=lun … 7=dom, isodow), en tasks y template_items.
-- NULL/empty = LEGACY (día de start_date = comportamiento ACTUAL) → retrocompatible: ninguna weekly
-- existente cambia (la columna nace NULL; cero backfill).
--
-- ADITIVO: solo añade columnas + reescribe is_task_due (rama weekly). materialize_day / materialize_task_today
-- / tasks_due_on NO cambian (todos llaman a is_task_due → heredan el multi-día).
-- Idempotente: add column (if not exists vía consolidado), drop constraint if exists + add, create or replace.

-- ── 1) Columna de días (tasks + template_items) ──────────────────────────────
alter table public.tasks          add column weekdays smallint[];
alter table public.template_items add column weekdays smallint[];

-- ── 2) CHECK: NULL/empty permitido (legacy); si hay valores → todos en 1..7, sin NULLs internos, ≤7 ──
alter table public.tasks          drop constraint if exists chk_tasks_weekdays;
alter table public.tasks          add  constraint chk_tasks_weekdays check (
  weekdays is null
  or (weekdays <@ array[1,2,3,4,5,6,7]::smallint[]
      and array_position(weekdays, null::smallint) is null
      and cardinality(weekdays) <= 7)
);
alter table public.template_items drop constraint if exists chk_template_items_weekdays;
alter table public.template_items add  constraint chk_template_items_weekdays check (
  weekdays is null
  or (weekdays <@ array[1,2,3,4,5,6,7]::smallint[]
      and array_position(weekdays, null::smallint) is null
      and cardinality(weekdays) <= 7)
);

-- ── 3) is_task_due: la rama weekly aprende el filtro de días (legacy si weekdays NULL/empty) ──
create or replace function public.is_task_due(t public.tasks, d date)
returns boolean
language plpgsql stable set search_path = ''
as $$
begin
  if d < t.start_date then return false; end if;
  if t.recurrence_until is not null and d > t.recurrence_until then return false; end if;
  if d = any (t.excluded_dates) then return false; end if;

  case t.recurrence
    when 'once'    then return d = t.start_date;
    when 'daily'   then return true;
    when 'weekly'  then
      -- multi-día (ADR-0019): due si el día de la semana ∈ weekdays; NULL/empty = día de start_date (legacy).
      if t.weekdays is null or cardinality(t.weekdays) = 0 then
        return ((d - t.start_date) % 7) = 0;
      else
        return extract(isodow from d)::int = any (t.weekdays); -- isodow: 1=lun … 7=dom
      end if;
    when 'monthly' then
      -- mismo día-de-mes que start_date; en meses cortos, clamp al último día (31 → 30/28).
      return extract(day from d)::int = least(
        extract(day from t.start_date)::int,
        extract(day from (date_trunc('month', d::timestamp) + interval '1 month' - interval '1 day'))::int
      );
    else return false;
  end case;
end $$;
