import { notFound } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageTitle } from "@/components/page-title";
import { MsBreadcrumb } from "@/components/ms/ms-breadcrumb";
import { RecipientsManager } from "@/components/ms/recipients-manager";
import type { MsDataset, MsRecipient } from "@/lib/ms/types";

export default async function MsDatasetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: ds } = await supabase
    .from("ms_datasets")
    .select("id, name, source_filename, columns, recipient_count, created_at, updated_at")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!ds) notFound();
  const { data: recs } = await supabase
    .from("ms_recipients")
    .select("id, dataset_id, email, fields, email_valid, created_at")
    .eq("dataset_id", id)
    .order("created_at", { ascending: true });

  return (
    <div className="flex flex-col gap-4">
      <MsBreadcrumb items={[{ label: "Destinatarios", href: "/ms/destinatarios" }, { label: (ds as MsDataset).name }]} />
      <PageTitle title={(ds as MsDataset).name} subtitle="Destinatarios de la lista — agrega, edita, duplica o elimina." />
      <RecipientsManager dataset={ds as MsDataset} recipients={(recs ?? []) as MsRecipient[]} />
    </div>
  );
}
