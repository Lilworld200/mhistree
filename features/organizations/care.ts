import "server-only";
import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { transaction } from "@/lib/db/client";
import { requireOrganization } from "./server";
import { registerPerson, lookupPeople } from "@/features/identity/server";
import { category } from "@/features/health-records/schema";
import {
  withAccess,
  authorize,
  type ActingContext,
} from "@/features/access/server";
import { DomainError } from "@/lib/errors";
import { listWork } from "@/features/clinical-care/work";
import { appendEvent } from "@/features/audit/server";

export async function registerOrganizationPatient(
  pool: Pool,
  session: string,
  input: unknown,
) {
  const d = z
    .object({ organizationId: z.uuid(), person: z.unknown() })
    .strict()
    .parse(input);
  await transaction(
    (tx) =>
      requireOrganization(tx, session, d.organizationId, "person.register"),
    pool,
  );
  return registerPerson(
    pool,
    session,
    `organization:${d.organizationId}`,
    d.person,
  );
}
export async function organizationLookup(
  pool: Pool,
  session: string,
  input: unknown,
) {
  const d = z
    .object({
      organizationId: z.uuid(),
      query: z.union([
        z.object({ exactAlias: z.string().min(1).max(80) }).strict(),
        z.object({ namePrefix: z.string().min(3).max(80) }).strict(),
      ]),
    })
    .strict()
    .parse(input);
  return lookupPeople(
    pool,
    session,
    `organization:${d.organizationId}`,
    d.query,
  );
}
export async function establishInitialCare(
  pool: Pool,
  session: string,
  input: unknown,
) {
  const d = z
    .object({
      organizationId: z.uuid(),
      patientPersonId: z.uuid(),
      categories: z.array(category).min(1).max(10),
      evidence: z.string().min(20).max(2000),
    })
    .strict()
    .parse(input);
  return transaction(async (tx) => {
    const actor = await requireOrganization(
      tx,
      session,
      d.organizationId,
      "person.register",
    );
    await requireOrganization(tx, session, d.organizationId, "records.write");
    if (
      !(
        await tx.query(
          "select 1 from mhistree.professionals where account_id=$1 and status='approved' and 'records.write'=any(privileges) for share",
          [actor.accountId],
        )
      ).rowCount
    )
      throw new DomainError("ACCESS_DENIED");
    const person = (
      await tx.query(
        "select * from mhistree.persons where id=$1 and original_organization_id=$2 and canonical_person_id is null for update",
        [d.patientPersonId, d.organizationId],
      )
    ).rows[0];
    if (
      !person ||
      (
        await tx.query(
          "select 1 from mhistree.accounts where person_id=$1 and status='active'",
          [d.patientPersonId],
        )
      ).rowCount
    )
      throw new DomainError("ACCESS_DENIED");
    const assignment = (
      await tx.query(
        "insert into mhistree.assignments(organization_id,patient_person_id,account_id,active,categories) values($1,$2,$3,true,$4) returning id",
        [d.organizationId, d.patientPersonId, actor.accountId, d.categories],
      )
    ).rows[0];
    const id = randomUUID(),
      contextId = `initial-care:${id}`;
    await tx.query(
      "insert into mhistree.initial_care_bases(id,patient_person_id,account_id,organization_id,assignment_id,categories,origin_context,evidence_reference,active) values($1,$2,$3,$4,$5,$6,$7,$8,true)",
      [
        id,
        d.patientPersonId,
        actor.accountId,
        d.organizationId,
        assignment.id,
        d.categories,
        contextId,
        d.evidence,
      ],
    );
    await tx.query(
      "insert into mhistree.staff_authorities(account_id,context_id,organization_id,privileges,evidence_reference) values($1,$2,$3,'{person.register}',$4)",
      [actor.accountId, contextId, d.organizationId, d.evidence],
    );
    await appendEvent(tx, {
      actorAccountId: actor.accountId,
      personId: d.patientPersonId,
      contextId,
      referenceId: id,
      action: "organization.assignment.updated",
    });
    return {
      kind: "initial-care" as const,
      basisId: id,
      organizationId: d.organizationId,
      assignmentId: assignment.id,
    };
  }, pool);
}

export async function organizationWorkspace(
  pool: Pool,
  session: string,
  context: ActingContext,
) {
  if (context.kind !== "organization" && context.kind !== "initial-care")
    throw new DomainError("ACCESS_DENIED");
  const data = await withAccess(pool, session, context, async (a) => {
    const row =
      context.kind === "organization"
        ? (
            await a.tx.query(
              "select patient_person_id,revision from mhistree.connections where id=$1 and organization_id=$2 and status='active'",
              [context.connectionId, context.organizationId],
            )
          ).rows[0]
        : (
            await a.tx.query(
              "select patient_person_id,1 revision from mhistree.initial_care_bases where id=$1 and account_id=$2 and active",
              [context.basisId, a.actor.accountId],
            )
          ).rows[0];
    if (!row) throw new DomainError("ACCESS_DENIED");
    let allowed = false;
    for (const cat of category.options) {
      try {
        await authorize(
          a,
          {
            patientPersonId: row.patient_person_id,
            originPersonId: row.patient_person_id,
            category: cat,
            visibility: "finalized",
            authorAccountId: a.actor.accountId,
            originalContext: a.contextId,
            originalOrganizationId: context.organizationId,
          },
          "read",
        );
        allowed = true;
        break;
      } catch (e) {
        if (!(e instanceof DomainError)) throw e;
      }
    }
    if (!allowed) throw new DomainError("ACCESS_DENIED");
    const state = (
      await a.tx.query(
        "select e.* from mhistree.persistent_state s join mhistree.contributions e on e.id=s.event_id where e.patient_person_id=$1 order by e.recorded_at desc limit 100",
        [row.patient_person_id],
      )
    ).rows;
    const recent = (
      await a.tx.query(
        "select e.* from mhistree.record_heads h join mhistree.contributions e on e.id=h.current_id where e.patient_person_id=$1 and e.visibility='finalized' order by e.recorded_at desc,e.id desc limit 30",
        [row.patient_person_id],
      )
    ).rows;
    await appendEvent(a.tx, {
      actorAccountId: a.actor.accountId,
      personId: row.patient_person_id,
      contextId: a.contextId,
      action: "record.read",
    });
    return {
      patientPersonId: row.patient_person_id,
      revision: row.revision,
      state,
      recent,
    };
  });
  return { ...data, work: await listWork(pool, session, context) };
}
