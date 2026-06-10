import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageTitle } from "@/components/page-title";
import { MsBreadcrumb } from "@/components/ms/ms-breadcrumb";
import { CampaignsManager } from "@/components/ms/campaigns-manager";
import { processDueScheduled } from "@/lib/ms/campaigns";
import type { MsCampaign } from "@/lib/ms/types";

export type BuilderDataset = { id: string; name: string; recipient_count: number };
export type BuilderTemplate = { id: string; name: string; subject: string };

export default async function MsLotesPage() {
  // Dispatch oportunista (complemento). El envío DESATENDIDO de v1 llega vía cron server-only (ADR-0029);
  // este pase cubre al usuario activo y comparte idempotencia (lock + unique), así no hay doble envío.
  await processDueScheduled();

  const supabase = await createSupabaseServerClient();
  const [{ data: camps }, { data: dsets }, { data: tpls }] = await Promise.all([
    supabase
      .from("ms_campaigns")
      .select("id, template_id, dataset_id, status, scheduled_at, total_count, sent_count, failed_count, subject_snapshot, body_html_snapshot, started_at, finished_at, created_at, updated_at")
      .order("created_at", { ascending: false }),
    supabase.from("ms_datasets").select("id, name, recipient_count").is("deleted_at", null).order("name"),
    supabase.from("ms_templates").select("id, name, subject").is("deleted_at", null).order("name"),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <MsBreadcrumb items={[{ label: "Lotes" }]} />
      <PageTitle title="Lotes de envío" subtitle="Arma, prueba, programa y envía campañas (≤100 por lote)." />
      <CampaignsManager
        campaigns={(camps ?? []) as MsCampaign[]}
        datasets={(dsets ?? []) as BuilderDataset[]}
        templates={(tpls ?? []) as BuilderTemplate[]}
      />
    </div>
  );
}
