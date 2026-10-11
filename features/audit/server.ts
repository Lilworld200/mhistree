import "server-only";
import type { PoolClient } from "pg";
export type AuditAction =
  | "clinical.request.updated"
  | "clinical.work.saved"
  | "clinical.entry.finalized"
  | "professional.submitted"
  | "professional.approved"
  | "professional.rejected"
  | "professional.suspended"
  | "appointment.requested"
  | "appointment.updated"
  | "care.message.saved"
  | "connection.consent.updated"
  | "patient.export.read"
  | "patient.review.requested"
  | "chat.message.saved"
  | "person.self-registered"
  | "profile.updated"
  | "contact.added-unverified"
  | "contact.removed"
  | "person.registered"
  | "identity.lookup"
  | "auth.activation.issued"
  | "auth.recovery.issued"
  | "auth.password-setup.completed"
  | "auth.patient.login"
  | "auth.logout"
  | "source.recorded"
  | "record.accept"
  | "record.correct"
  | "record.read"
  | "connection.revoked"
  | "file.read.authorized"
  | "access.denied";
export type AuditEvent = {
  action: AuditAction;
  actorAccountId?: string;
  personId?: string;
  contextId?: string;
  referenceId?: string;
};
/** Same transaction as the domain mutation. Deliberately accepts no clinical text or arbitrary metadata. */
export async function appendEvent(tx: PoolClient, event: AuditEvent) {
  await tx.query(
    "insert into mhistree.audit_events(actor_account_id,person_id,action,context_id,reference_id) values($1,$2,$3,$4,$5)",
    [
      event.actorAccountId ?? null,
      event.personId ?? null,
      event.action,
      event.contextId ?? null,
      event.referenceId ?? null,
    ],
  );
}
