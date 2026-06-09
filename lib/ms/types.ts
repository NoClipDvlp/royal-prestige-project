// Tipos del módulo de correo masivo (MS, ADR-0027). NO-CORE. Espejan el schema de db/migrations/0018.
// Nicolas llama "remitentes" a los recipients (destinatarios de un dataset).

export type MsTemplate = {
  id: string;
  name: string;
  subject: string;
  body_html: string;
  created_at: string;
  updated_at: string;
};

export type MsDataset = {
  id: string;
  name: string;
  source_filename: string | null;
  columns: MsColumns;
  recipient_count: number;
  created_at: string;
  updated_at: string;
};

/** Mapeo de columnas confirmado en el import: el orden de los campos + cuál es el email. */
export type MsColumns = { fields: string[]; emailField: string };

export type MsRecipient = {
  id: string;
  dataset_id: string;
  email: string;
  fields: Record<string, string>;
  email_valid: boolean;
  created_at: string;
};

export type MsCampaignStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "sent"
  | "partial"
  | "failed"
  | "canceled";

export type MsCampaign = {
  id: string;
  template_id: string | null;
  dataset_id: string | null;
  subject_snapshot: string | null;
  body_html_snapshot: string | null;
  status: MsCampaignStatus;
  scheduled_at: string | null;
  total_count: number;
  sent_count: number;
  failed_count: number;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MsSendStatus = "pending" | "sent" | "failed" | "skipped";

export type MsSend = {
  id: string;
  campaign_id: string;
  recipient_id: string | null;
  email: string;
  subject_snapshot: string | null;
  body_html_snapshot: string | null;
  status: MsSendStatus;
  error: string | null;
  provider_message_id: string | null;
  sent_at: string | null;
  created_at: string;
};

/**
 * Modo de asignación plantilla→destinatarios al armar un lote (ADR-0027 Act.2-A):
 * - all:   la MISMA plantilla a todos.
 * - subset: la plantilla a una selección de destinatarios.
 * - odd_id: a los "impares según id" (índice de fila impar) — pedido explícito de Nicolas.
 * - per_row: una plantilla por fila (cada destinatario puede llevar plantilla distinta).
 */
export type MsAssignMode = "all" | "subset" | "odd_id" | "per_row";

export const CAMPAIGN_STATUS_LABEL: Record<MsCampaignStatus, string> = {
  draft: "Borrador",
  scheduled: "Programado",
  sending: "Enviando",
  sent: "Enviado",
  partial: "Parcial",
  failed: "Falló",
  canceled: "Cancelado",
};

export const SEND_STATUS_LABEL: Record<MsSendStatus, string> = {
  pending: "Pendiente",
  sent: "Enviado",
  failed: "Falló",
  skipped: "Omitido (baja)",
};
