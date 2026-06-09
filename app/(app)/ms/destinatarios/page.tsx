import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PageTitle } from "@/components/page-title";
import { DatasetsManager } from "@/components/ms/datasets-manager";
import type { MsDataset } from "@/lib/ms/types";

// Listas de destinatarios (datasets). RLS-self limita a las propias.
export default async function MsDestinatariosPage() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("ms_datasets")
    .select("id, name, source_filename, columns, recipient_count, created_at, updated_at")
    .is("deleted_at", null)
    .order("updated_at", { ascending: false });
  const datasets = (data ?? []) as MsDataset[];

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Destinatarios" subtitle="Importa listas desde CSV y gestiona los contactos." />
      <DatasetsManager datasets={datasets} />
    </div>
  );
}
