import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageTitle } from "@/components/page-title";
import { GlassCard } from "@/components/ui/card";
import { CampaignControls } from "@/components/ms/campaign-controls";
import { CAMPAIGN_STATUS_LABEL, SEND_STATUS_LABEL, type MsCampaign, type MsSend } from "@/lib/ms/types";

const SEND_TONE: Record<string, string> = {
  pending: "text-muted",
  sent: "text-positive",
  failed: "text-red-500",
  skipped: "text-amber-600",
};

export default async function MsLoteDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: c } = await supabase
    .from("ms_campaigns")
    .select("id, template_id, dataset_id, status, scheduled_at, total_count, sent_count, failed_count, subject_snapshot, body_html_snapshot, started_at, finished_at, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (!c) notFound();
  const { data: sends } = await supabase
    .from("ms_sends")
    .select("id, campaign_id, recipient_id, email, subject_snapshot, body_html_snapshot, status, error, provider_message_id, sent_at, created_at")
    .eq("campaign_id", id)
    .order("created_at", { ascending: true });
  const campaign = c as MsCampaign;
  const rows = (sends ?? []) as MsSend[];

  return (
    <div className="flex flex-col gap-4">
      <Link href="/ms/lotes" className="inline-flex items-center gap-1.5 text-xs text-muted transition hover:text-fg">
        <ArrowLeft size={14} /> Lotes
      </Link>
      <div className="flex items-start justify-between gap-3">
        <PageTitle title="Detalle del lote" subtitle={`${CAMPAIGN_STATUS_LABEL[campaign.status]} · ${campaign.total_count} destinatarios`} />
        <CampaignControls id={campaign.id} status={campaign.status} />
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          ["Enviados", campaign.sent_count],
          ["Fallidos", campaign.failed_count],
          ["Total", campaign.total_count],
        ].map(([label, value]) => (
          <GlassCard key={label} className="p-3 text-center">
            <p className="text-lg font-semibold text-fg">{value}</p>
            <p className="text-[11px] text-muted">{label}</p>
          </GlassCard>
        ))}
      </div>

      <GlassCard className="overflow-x-auto p-0">
        <table className="w-full text-left text-xs">
          <thead className="bg-white/40 text-muted dark:bg-white/5">
            <tr>
              <th className="px-3 py-2 font-medium">Correo</th>
              <th className="px-3 py-2 font-medium">Estado</th>
              <th className="px-3 py-2 font-medium">Detalle</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-t border-white/40 dark:border-white/10">
                <td className="px-3 py-1.5 text-fg">{s.email}</td>
                <td className={`px-3 py-1.5 font-medium ${SEND_TONE[s.status] ?? ""}`}>{SEND_STATUS_LABEL[s.status]}</td>
                <td className="px-3 py-1.5 text-muted">
                  {s.status === "sent" && s.sent_at ? new Date(s.sent_at).toLocaleString() : s.error ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className="px-3 py-4 text-center text-xs text-muted">Sin destinatarios en este lote.</p>}
      </GlassCard>
    </div>
  );
}
