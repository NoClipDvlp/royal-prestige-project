"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { sendCampaign, duplicateCampaign } from "@/lib/ms/campaigns";
import type { MsCampaignStatus } from "@/lib/ms/types";

export function CampaignControls({ id, status }: { id: string; status: MsCampaignStatus }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const canSend = ["draft", "scheduled", "partial", "failed"].includes(status);
  const resume = status === "partial" || status === "failed";

  function send() {
    start(async () => {
      const r = await sendCampaign(id);
      if (!r.ok) toast(r.error ?? "No se pudo enviar.", "error");
      else {
        toast(`Enviado: ${r.sent} ok${r.failed ? `, ${r.failed} fallidos` : ""}${r.skipped ? `, ${r.skipped} omitidos` : ""}.`);
        router.refresh();
      }
    });
  }
  function dup() {
    start(async () => {
      const r = await duplicateCampaign(id);
      if (!r.ok) toast(r.error ?? "No se pudo duplicar.", "error");
      else {
        toast("Lote duplicado.");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex shrink-0 gap-2">
      {canSend && (
        <Button onClick={send} disabled={pending}>
          <Send size={15} /> {resume ? "Reanudar" : "Enviar"}
        </Button>
      )}
      <Button variant="glass" onClick={dup} disabled={pending}>
        <Copy size={15} /> Duplicar
      </Button>
    </div>
  );
}
