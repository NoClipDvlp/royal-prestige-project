import { revalidatePath } from "next/cache";

/**
 * ADR-0031: revalida TODAS las superficies server-rendered que muestran estado de tareas — una sola verdad
 * viva por panel. La llaman las mutaciones del distribuidor (lib/actions/tasks.ts) Y las acciones de admin
 * que MATERIALIZAN/borran tareas del distribuidor (assign/unassign/propagate/deleteTemplateItem) — esas antes
 * solo revalidaban /admin, dejando /metricas y el home con un snapshot viejo.
 *
 * Helper compartido (no es un server action; es una utilidad llamada DENTRO de server actions).
 * Los componentes que cargan en el CLIENTE (UserTasks, carga-premium) NO los cubre revalidatePath →
 * se refrescan vía RC_REFRESH_EVENT del RefreshButton.
 */
export function revalidatePanels(): void {
  revalidatePath("/");
  revalidatePath("/tareas");
  revalidatePath("/metricas");
  revalidatePath("/metricas/carga"); // dashboard premium del auditor (ADR-0030/0033)
  revalidatePath("/metricas/[userId]", "page"); // perfil del distribuidor (auditor/admin)
  revalidatePath("/admin"); // panel admin (lee tareas vivas del distribuidor)
}
