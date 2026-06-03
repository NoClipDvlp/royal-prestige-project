"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TaskCreateModal, type TaskCategory } from "@/components/tasks/task-create-modal";

/** "+ Nueva tarea" del home: reutiliza el mismo modal de creación; crea para HOY (revalida "/" y "/tareas"). */
export function QuickAddButton({ date, categories }: { date: string; categories: TaskCategory[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="glass" className="h-9 px-3 text-xs" onClick={() => setOpen(true)}>
        <Plus size={15} /> Nueva tarea
      </Button>
      <TaskCreateModal
        open={open}
        date={date}
        startHour={9}
        durationMin={null}
        categories={categories}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
