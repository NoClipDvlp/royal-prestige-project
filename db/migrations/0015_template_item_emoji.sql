-- 0015_template_item_emoji.sql — ADR-0024: emoji por ítem de plantilla.
--
-- El admin elige/edita un emoji por ítem de plantilla; se muestra en el cronograma IMPRESO de la plantilla
-- (no en la del distribuidor — "solo de plantillas"). Aditivo: columna nullable + CHECK de longitud para
-- evitar texto largo. NO toca el motor (is_task_due/materialize), ni la RLS (template_items_admin = for all),
-- ni los triggers. Idempotente vía consolidado (add column → if not exists; drop constraint + add).

alter table public.template_items add column emoji text;

alter table public.template_items
  add constraint chk_template_item_emoji check (emoji is null or char_length(emoji) <= 16);
