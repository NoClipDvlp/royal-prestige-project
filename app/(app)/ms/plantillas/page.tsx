import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageTitle } from "@/components/page-title";
import { MsBreadcrumb } from "@/components/ms/ms-breadcrumb";
import { MsTemplatesManager } from "@/components/ms/templates-manager";
import type { MsTemplate } from "@/lib/ms/types";

// Plantillas de correo del distribuidor. RLS de ms_templates (owner + ms_enabled) limita a las propias.
export default async function MsPlantillasPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("ms_templates")
    .select("id, name, subject, body_html, created_at, updated_at")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  const templates = (data ?? []) as MsTemplate[];

  return (
    <div className="flex flex-col gap-4">
      <MsBreadcrumb items={[{ label: "Plantillas" }]} />
      <PageTitle title="Plantillas de correo" subtitle="Crea y reutiliza plantillas con campos {merge} por destinatario." />
      <MsTemplatesManager templates={templates} />
    </div>
  );
}
