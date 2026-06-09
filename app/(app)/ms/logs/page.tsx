import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageTitle } from "@/components/page-title";
import { GlassCard } from "@/components/ui/card";
import { SEND_STATUS_LABEL, type MsSendStatus } from "@/lib/ms/types";

const SEND_TONE: Record<string, string> = {
  pending: "text-muted",
  sent: "text-positive",
  failed: "text-red-500",
  skipped: "text-amber-600",
};

type LogRow = {
  id: string;
  email: string;
  status: MsSendStatus;
  error: string | null;
  sent_at: string | null;
  created_at: string;
};

// Registro global de envíos (ms_sends del propio usuario por RLS). Resultado por destinatario (ADR-0027 §5).
export default async function MsLogsPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("ms_sends")
    .select("id, email, status, error, sent_at, created_at")
    .order("created_at", { ascending: false })
    .limit(300);
  const rows = (data ?? []) as LogRow[];

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Registro de envíos" subtitle="Resultado por destinatario (últimos 300)." />
      {rows.length === 0 ? (
        <GlassCard className="p-6 text-center text-sm text-muted">Aún no hay envíos registrados.</GlassCard>
      ) : (
        <GlassCard className="overflow-x-auto p-0">
          <table className="w-full text-left text-xs">
            <thead className="bg-white/40 text-muted dark:bg-white/5">
              <tr>
                <th className="px-3 py-2 font-medium">Correo</th>
                <th className="px-3 py-2 font-medium">Estado</th>
                <th className="px-3 py-2 font-medium">Cuándo / detalle</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-t border-white/40 dark:border-white/10">
                  <td className="px-3 py-1.5 text-fg">{s.email}</td>
                  <td className={`px-3 py-1.5 font-medium ${SEND_TONE[s.status] ?? ""}`}>{SEND_STATUS_LABEL[s.status]}</td>
                  <td className="px-3 py-1.5 text-muted">
                    {s.status === "sent" && s.sent_at ? new Date(s.sent_at).toLocaleString() : s.error ?? new Date(s.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassCard>
      )}
    </div>
  );
}
