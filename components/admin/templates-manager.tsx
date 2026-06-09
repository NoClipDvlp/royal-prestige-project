"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useDensity } from "@/components/ui/density";
import { GlassCard } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { WeekdayPicker } from "@/components/tasks/weekday-picker";
import { cn } from "@/lib/cn";
import { densityClasses } from "@/lib/density";
import { WORKDAY_END, WORKDAY_START } from "@/lib/constants";
import {
  DURATION_OPTIONS,
  PRIORITY_LABEL,
  RECURRENCE_LABEL,
  type TaskPriority,
  type TaskRecurrence,
} from "@/lib/tasks/types";
import {
  countItemLinkedTasks,
  createTemplate,
  createTemplateItem,
  deleteTemplateItem,
  propagateTemplate,
  softDeleteTemplate,
  updateTemplate,
  updateTemplateItem,
  type TemplateItemInput,
} from "@/lib/actions/templates";
import { Users, Printer } from "lucide-react";

export type CatOption = { id: string; name: string };
export type AdminTemplateItem = {
  id: string;
  title: string;
  categoryId: string | null;
  priority: TaskPriority;
  recurrence: TaskRecurrence;
  timeSlot: string | null;
  durationMinutes: number | null;
  weekdays: number[] | null;
  emoji: string | null;
};
export type AdminTemplate = {
  id: string;
  name: string;
  description: string | null;
  items: AdminTemplateItem[];
};

const HOURS = Array.from({ length: WORKDAY_END - WORKDAY_START + 1 }, (_, i) => WORKDAY_START + i);
const WORKDAY_END_MIN = WORKDAY_END * 60;

function hourOf(timeSlot: string | null): number | null {
  return timeSlot ? Number.parseInt(timeSlot, 10) : null;
}

export function TemplatesManager({ templates, categories }: { templates: AdminTemplate[]; categories: CatOption[] }) {
  const { density } = useDensity();
  const d = densityClasses(density);
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function create(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setErr(null);
    start(async () => {
      const r = await createTemplate(name.trim(), desc.trim() || null);
      if (!r.ok) setErr(r.error ?? "Error");
      else {
        setName("");
        setDesc("");
      }
    });
  }

  return (
    <GlassCard className={d.cardPad}>
      <h2 className="mb-3 text-sm font-semibold text-fg">Plantillas de tareas</h2>

      <form onSubmit={create} className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input placeholder="Nombre de la plantilla" value={name} onChange={(e) => setName(e.target.value)} className="sm:w-56" />
        <Input placeholder="Descripción (opcional)" value={desc} onChange={(e) => setDesc(e.target.value)} className="flex-1" />
        <Button type="submit" disabled={pending || !name.trim()}>
          <Plus size={16} /> Crear plantilla
        </Button>
      </form>
      {err ? <p className="mb-2 text-xs text-red-500">{err}</p> : null}

      {templates.length === 0 ? (
        <p className="text-sm text-muted">Sin plantillas aún.</p>
      ) : (
        <div className="flex flex-col gap-3">
          {templates.map((t) => (
            <TemplateCard key={t.id} template={t} categories={categories} />
          ))}
        </div>
      )}
    </GlassCard>
  );
}

function TemplateCard({ template, categories }: { template: AdminTemplate; categories: CatOption[] }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(template.name);
  const [desc, setDesc] = useState(template.description ?? "");
  const [adding, setAdding] = useState(false);
  const [propOpen, setPropOpen] = useState(false);
  const [propMsg, setPropMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const catName = (id: string | null) => (id ? categories.find((c) => c.id === id)?.name ?? "—" : null);

  function saveHeader() {
    setErr(null);
    start(async () => {
      const r = await updateTemplate(template.id, { name: name.trim(), description: desc.trim() || null });
      if (!r.ok) setErr(r.error ?? "Error");
      else setEditing(false);
    });
  }
  function remove() {
    if (!confirm(`¿Borrar la plantilla "${template.name}"?`)) return;
    setErr(null);
    start(async () => {
      const r = await softDeleteTemplate(template.id);
      if (!r.ok) setErr(r.error ?? "Error");
    });
  }
  function propagate() {
    setErr(null);
    setPropMsg(null);
    start(async () => {
      const r = await propagateTemplate(template.id);
      if (!r.ok) setErr(r.error ?? "Error");
      else {
        setPropOpen(false);
        setPropMsg("Cambios aplicados a los asignados (sin pisar lo que cada distribuidor editó).");
      }
    });
  }

  return (
    <div className="rounded-2xl border border-white/60 bg-white/40 p-4 dark:border-white/10 dark:bg-white/5">
      <div className="flex items-start justify-between gap-2">
        {editing ? (
          <div className="flex flex-1 flex-col gap-2">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" />
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Descripción" />
            <div className="flex gap-2">
              <Button onClick={saveHeader} disabled={pending || !name.trim()} className="h-8 text-xs">Guardar</Button>
              <Button variant="ghost" onClick={() => setEditing(false)} className="h-8 text-xs">Cancelar</Button>
            </div>
          </div>
        ) : (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-fg">{template.name}</p>
            {template.description ? <p className="truncate text-xs text-muted">{template.description}</p> : null}
          </div>
        )}
        {!editing && (
          <div className="flex shrink-0 items-center gap-1">
            <button type="button" onClick={() => setEditing(true)} aria-label="Editar plantilla" className="text-muted transition hover:text-fg">
              <Pencil size={15} />
            </button>
            <button type="button" onClick={remove} aria-label="Borrar plantilla" className="text-muted transition hover:text-red-500">
              <Trash2 size={15} />
            </button>
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-col gap-1.5">
        {template.items.length === 0 ? (
          <p className="text-xs text-muted">Sin tareas en la plantilla.</p>
        ) : (
          template.items.map((it) => (
            <ItemRow key={it.id} item={it} catName={catName(it.categoryId)} categories={categories} />
          ))
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 text-xs font-medium text-accent transition hover:brightness-110"
          >
            <Plus size={14} /> Añadir tarea
          </button>
        )}
        {!propOpen && (
          <button
            type="button"
            onClick={() => {
              setPropOpen(true);
              setPropMsg(null);
            }}
            className="inline-flex items-center gap-1 text-xs font-medium text-accent transition hover:brightness-110"
          >
            <Users size={14} /> Aplicar a asignados
          </button>
        )}
        {template.items.length > 0 && (
          <a
            href={`/plantillas/imprimir?id=${template.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-accent transition hover:brightness-110"
          >
            <Printer size={14} /> Imprimir cronograma
          </a>
        )}
      </div>

      {adding && (
        <div className="mt-2">
          <ItemForm templateId={template.id} categories={categories} onDone={() => setAdding(false)} />
        </div>
      )}
      {propOpen && (
        <div className="mt-2 rounded-xl border border-white/60 bg-white/50 p-3 dark:border-white/10 dark:bg-white/5">
          <p className="text-xs font-medium text-fg">Aplicar a distribuidores asignados</p>
          <p className="mt-1 text-[11px] text-muted">
            Actualiza las tareas YA asignadas con la definición actual de la plantilla. No sobrescribe lo que
            cada distribuidor haya editado, ni su historial. “Solo futuras” = no aplicar nada ahora.
          </p>
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPropOpen(false)} disabled={pending} className="h-8 text-xs">
              Solo futuras
            </Button>
            <Button onClick={propagate} disabled={pending} className="h-8 text-xs">
              Aplicar a asignados
            </Button>
          </div>
        </div>
      )}
      {propMsg ? <p className="mt-2 text-xs text-positive">{propMsg}</p> : null}
      {err ? <p className="mt-2 text-xs text-red-500">{err}</p> : null}
    </div>
  );
}

function ItemRow({ item, catName, categories }: { item: AdminTemplateItem; catName: string | null; categories: CatOption[] }) {
  const { density } = useDensity();
  const d = densityClasses(density);
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();

  if (editing) {
    return <ItemForm item={item} categories={categories} onDone={() => setEditing(false)} />;
  }
  const range =
    item.timeSlot != null
      ? `${item.timeSlot}${item.durationMinutes ? ` · ${item.durationMinutes}m` : ""}`
      : "sin hora";
  return (
    <div className={cn("flex items-center gap-2 rounded-xl bg-white/40 transition-colors hover:bg-white/60 dark:bg-white/5 dark:hover:bg-white/10", d.rowPad)}>
      <span className="min-w-0 flex-1 truncate text-sm text-fg">
        {item.emoji ? <span className="mr-1">{item.emoji}</span> : null}
        {item.title}
      </span>
      {d.showSecondary && (
        <span className="hidden shrink-0 text-[11px] text-muted sm:inline">
          {range} · {RECURRENCE_LABEL[item.recurrence]} · {PRIORITY_LABEL[item.priority]}
          {catName ? ` · ${catName}` : ""}
        </span>
      )}
      <button type="button" onClick={() => setEditing(true)} aria-label="Editar tarea" className="shrink-0 text-muted transition hover:text-fg">
        <Pencil size={14} />
      </button>
      <button
        type="button"
        onClick={() => {
          start(async () => {
            const c = await countItemLinkedTasks(item.id);
            const n = c.ok ? c.count ?? 0 : 0;
            const msg =
              n > 0
                ? `Quitar "${item.title}"? ${n} tarea(s) asignada(s) se desvincularán (siguen vivas, sin plantilla).`
                : `¿Quitar "${item.title}" de la plantilla?`;
            if (!window.confirm(msg)) return;
            await deleteTemplateItem(item.id);
          });
        }}
        aria-label="Quitar tarea"
        className={cnRed(pending)}
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

function cnRed(pending: boolean) {
  return `shrink-0 text-muted transition hover:text-red-500 ${pending ? "opacity-50" : ""}`;
}

function ItemForm({
  templateId,
  item,
  categories,
  onDone,
}: {
  templateId?: string;
  item?: AdminTemplateItem;
  categories: CatOption[];
  onDone: () => void;
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [hour, setHour] = useState<number | null>(hourOf(item?.timeSlot ?? null));
  const [duration, setDuration] = useState<number | null>(item?.durationMinutes ?? null);
  const [recurrence, setRecurrence] = useState<TaskRecurrence>(item?.recurrence ?? "once");
  const [priority, setPriority] = useState<TaskPriority>(item?.priority ?? "medium");
  const [categoryId, setCategoryId] = useState<string>(item?.categoryId ?? "");
  const [weekdays, setWeekdays] = useState<number[]>(item?.weekdays ?? []);
  const [emoji, setEmoji] = useState<string>(item?.emoji ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const overflows = duration != null && hour != null && hour * 60 + duration > WORKDAY_END_MIN;

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    if (overflows) return setErr("La duración se pasa de las 22:00.");
    setErr(null);
    const payload: TemplateItemInput = {
      title: title.trim(),
      categoryId: categoryId || null,
      priority,
      recurrence,
      timeSlot: hour != null ? `${String(hour).padStart(2, "0")}:00` : null,
      durationMinutes: duration,
      // weekly: días de recurrencia; once: día puntual para el cronograma de plantilla (print). Resto: sin día.
      weekdays: recurrence === "weekly" || recurrence === "once" ? weekdays : null,
      emoji: emoji.trim() ? emoji.trim() : null, // ADR-0024
    };
    start(async () => {
      const r = item ? await updateTemplateItem(item.id, payload) : await createTemplateItem(templateId as string, payload);
      if (!r.ok) setErr(r.error ?? "Error");
      else onDone();
    });
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-white/60 bg-white/50 p-3 dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted">{item ? "Editar tarea" : "Nueva tarea de la plantilla"}</span>
        <button type="button" onClick={onDone} aria-label="Cerrar" className="text-muted transition hover:text-fg"><X size={15} /></button>
      </div>
      <div className="mt-2 flex flex-col gap-2">
        <div className="flex gap-2">
          <Input
            className="w-14 shrink-0 text-center text-lg"
            placeholder="🙂"
            value={emoji}
            onChange={(e) => setEmoji(e.target.value)}
            aria-label="Emoji (para el cronograma impreso)"
            maxLength={8}
          />
          <Input className="flex-1" placeholder="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Select value={hour ?? ""} onChange={(e) => setHour(e.target.value === "" ? null : Number(e.target.value))} aria-label="Hora">
            <option value="">Sin hora</option>
            {HOURS.map((h) => (
              <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
            ))}
          </Select>
          <Select value={duration === null ? "" : String(duration)} onChange={(e) => setDuration(e.target.value === "" ? null : Number(e.target.value))} aria-label="Duración">
            {DURATION_OPTIONS.map((o) => (
              <option key={o.label} value={o.value === null ? "" : String(o.value)}>{o.label}</option>
            ))}
          </Select>
          <Select value={recurrence} onChange={(e) => setRecurrence(e.target.value as TaskRecurrence)} aria-label="Recurrencia">
            {(Object.keys(RECURRENCE_LABEL) as TaskRecurrence[]).map((r) => (
              <option key={r} value={r}>{RECURRENCE_LABEL[r]}</option>
            ))}
          </Select>
          <Select value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)} aria-label="Prioridad">
            {(Object.keys(PRIORITY_LABEL) as TaskPriority[]).map((p) => (
              <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
            ))}
          </Select>
          <Select className="col-span-2 sm:col-span-1" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Categoría">
            <option value="">Sin categoría</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
        {(recurrence === "weekly" || recurrence === "once") && (
          <div className="flex flex-col gap-1">
            <span className="px-1 text-[11px] text-muted">
              {recurrence === "weekly" ? "Días de la semana" : "Día (para el cronograma de la semana)"}
            </span>
            <WeekdayPicker value={weekdays} onChange={setWeekdays} />
            {recurrence === "once" ? (
              <span className="px-1 text-[10px] text-muted/80">
                Una sola vez, ese día de la semana impresa. No recurre ni genera tareas repetidas.
              </span>
            ) : null}
          </div>
        )}
        {err ? <p className="text-xs text-red-500">{err}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onDone} className="h-8 text-xs">Cancelar</Button>
          <Button type="submit" disabled={pending || !title.trim() || overflows} className="h-8 text-xs">
            {item ? "Guardar" : "Añadir"}
          </Button>
        </div>
      </div>
    </form>
  );
}
