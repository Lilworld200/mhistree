/**
 * Security Audit Logging Utility (`lib/security/audit.ts`)
 * ─────────────────────────────────────────────────────────────────
 * Records security audit logs to Supabase `audit_logs` table for
 * HIPAA compliance, PHI access tracking, and verification events.
 */
import { createAdminSupabaseClient } from "@/lib/supabase/server";

export interface AuditLogParams {
  actorId: string;
  actorRole: "patient" | "clinician" | "system";
  action:
    | "view_timeline"
    | "verify_memory"
    | "extract_memory"
    | "export_ehr"
    | "chat_message"
    | "document_ingest";
  patientId?: string;
  ipAddress?: string;
  metadata?: Record<string, unknown>;
}

export async function logAuditEvent(params: AuditLogParams): Promise<void> {
  try {
    const supabase = createAdminSupabaseClient();
    await supabase.from("audit_logs").insert({
      actor_id: params.actorId,
      actor_role: params.actorRole,
      action: params.action,
      patient_id: params.patientId ?? null,
      ip_address: params.ipAddress ?? null,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    });
  } catch (err) {
    console.error("Failed to write audit log:", err);
  }
}
