import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { LocalPrivateStore } from "@/lib/storage/local";
import { uploadDocument } from "@/features/documents/server";
import { readPrivateOriginal } from "@/features/access/private-files";
import { revokeConnection } from "@/features/access/server";
import { KeycloakProvider } from "@/lib/auth/keycloak";
import {
  issueCredential,
  redeemCredential,
  completeSetup,
  signIn,
} from "@/features/auth/server";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import {
  flagDuplicate,
  duplicatePreview,
  reviewDuplicate,
} from "@/features/identity/duplicates";
import {
  mergeIdentities,
  previewReversal,
  reverseMerge,
} from "@/features/identity/merge";
import { verifySession } from "@/features/auth/sessions";
import { transaction } from "@/lib/db/client";
import {
  recordSource,
  acceptContribution,
} from "@/features/health-records/server";
import { timeline } from "@/features/health-records/timeline";
import { initiateDirectConnection } from "@/features/practitioner/patients";
import { lookupPeople } from "@/features/identity/server";
import {
  createConversation,
  sendMessage,
  conversationHistory,
} from "@/features/ai-chat/server";
let db: Awaited<ReturnType<typeof testDatabase>>,
  reviewer: Awaited<ReturnType<typeof staffFixture>>;
beforeAll(async () => {
  db = await testDatabase();
  reviewer = await staffFixture(db.pool);
  await db.pool.query(
    "insert into mhistree.staff_authorities(account_id,context_id,privileges,evidence_reference) values($1,'review:identity','{identity.review}','Synthetic designated identity reviewer')",
    [reviewer.accountId],
  );
});
afterAll(async () => {
  await db?.stop();
});
async function pair() {
  const a = await staffFixture(db.pool),
    b = await staffFixture(db.pool);
  await db.pool.query(
    "update mhistree.accounts set last_successful_patient_login_at=$2 where id=$1",
    [a.accountId, "2026-10-10T10:00:00Z"],
  );
  await db.pool.query(
    "update mhistree.accounts set last_successful_patient_login_at=$2 where id=$1",
    [b.accountId, "2026-10-11T10:00:00Z"],
  );
  const c = await flagDuplicate(db.pool, a.session, {
    personId: a.personId,
    candidateId: b.personId,
    reason: "Synthetic verified duplicate identities",
  });
  const preview = await duplicatePreview(db.pool, reviewer.session, c.id);
  await reviewDuplicate(db.pool, reviewer.session, {
    id: c.id,
    version: 1,
    decision: "approved",
    identityEvidence:
      "Synthetic independent verification of both identities and ownership",
    ownershipVerified: true,
    expectedSurvivorId: preview.survivorId,
  });
  return {
    a,
    b,
    c,
    input: {
      caseId: c.id,
      operationId: randomUUID(),
      version: 2,
      expectedSurvivorId: b.personId,
    },
  };
}
async function report(
  patient: Awaited<ReturnType<typeof staffFixture>>,
  text: string,
) {
  const source = await recordSource(
    db.pool,
    patient.session,
    { kind: "patient" },
    {
      patientPersonId: patient.personId,
      category: "symptom",
      visibility: "finalized",
      sourceTimezone: "Africa/Lagos",
      content: text,
      clientKey: randomUUID(),
    },
  );
  return acceptContribution(
    db.pool,
    patient.session,
    { kind: "patient" },
    {
      operationKey: randomUUID(),
      sourceId: source.sourceId,
      sourceVersion: 1,
      sourceItemId: "report",
      body: { text, bodySite: null, contextLinks: [] },
      occurredAt: { precision: "unknown" },
      status: "unknown",
      sourceSpans: [text],
    },
  );
}
it("concurrent merge replays once, preserves history/aliases and original grants, and rejects the losing session", async () => {
  const p = await pair();
  const conversation = randomUUID();
  const store = new LocalPrivateStore(
    resolve(".local", `merge-original-${randomUUID()}`),
  );
  const original = new TextEncoder().encode(
    "Synthetic retained original document",
  );
  const document = await uploadDocument(
    db.pool,
    p.a.session,
    {
      filename: "synthetic.txt",
      mime: "text/plain",
      bytes: original,
      key: randomUUID(),
      timezone: "UTC",
    },
    store,
  );
  await createConversation(db.pool, p.a.session, conversation);
  await sendMessage(db.pool, p.a.session, {
    conversationId: conversation,
    requestKey: randomUUID(),
    content: "Synthetic original patient message",
    timezone: "Africa/Lagos",
  });
  await report(p.a, "Synthetic first origin symptom");
  await report(p.b, "Synthetic second origin symptom");
  const doctor = await staffFixture(db.pool),
    connection = (
      await initiateDirectConnection(db.pool, doctor.session, {
        patientPersonId: p.a.personId,
        requestKey: randomUUID(),
        method: "in-person",
        categories: ["symptom"],
        exclusions: [],
        evidence: "Synthetic first-origin consent only",
      })
    ).id;
  const alias = `TEST-${randomUUID()}`;
  const revoked = await initiateDirectConnection(db.pool, doctor.session, {
    patientPersonId: p.b.personId,
    requestKey: randomUUID(),
    method: "in-person",
    categories: ["symptom"],
    exclusions: [],
    evidence: "Synthetic revoked original grant",
  });
  await revokeConnection(db.pool, p.b.session, revoked.id);
  const org = randomUUID(),
    orgConnection = randomUUID(),
    assignment = randomUUID();
  await db.pool.query(
    "insert into mhistree.organizations(id,status) values($1,'approved')",
    [org],
  );
  await db.pool.query(
    "insert into mhistree.memberships(organization_id,account_id,active,privileges) values($1,$2,true,'{records.read}')",
    [org, doctor.accountId],
  );
  await db.pool.query(
    "insert into mhistree.assignments(id,organization_id,patient_person_id,account_id,active,categories) values($1,$2,$3,$4,true,'{symptom}')",
    [assignment, org, p.a.personId, doctor.accountId],
  );
  await db.pool.query(
    "insert into mhistree.connections(id,patient_person_id,kind,organization_id,status) values($1,$2,'organization',$3,'active')",
    [orgConnection, p.a.personId, org],
  );
  await db.pool.query(
    "insert into mhistree.consents(connection_id,categories,exclusions,origin_person_ids,origin_context_ids,method,responsible_account_id,evidence_reference) values($1,'{symptom}','{}',$2,'{*}','in-person',$3,'Synthetic original organization scope verification')",
    [orgConnection, [p.a.personId], doctor.accountId],
  );
  await db.pool.query(
    "insert into mhistree.patient_identifiers(alias,person_id,origin_person_id) values($1,$2,$2)",
    [alias, p.a.personId],
  );
  const results = await Promise.all([
    mergeIdentities(db.pool, reviewer.session, p.input),
    mergeIdentities(db.pool, reviewer.session, p.input),
  ]);
  expect(results.filter((r) => !r.replayed)).toHaveLength(1);
  expect(
    await readPrivateOriginal(
      db.pool,
      p.b.session,
      { kind: "patient" },
      document.source_id,
      store,
    ),
  ).toEqual(original);
  expect(
    (
      await timeline(db.pool, doctor.session, {
        kind: "direct",
        connectionId: revoked.id,
      })
    ).items,
  ).toHaveLength(0);
  expect(
    (await conversationHistory(db.pool, p.b.session, conversation)).items[0]
      .content,
  ).toBe("Synthetic original patient message");
  expect(
    (
      await timeline(db.pool, doctor.session, {
        kind: "organization",
        organizationId: org,
        connectionId: orgConnection,
        assignmentId: assignment,
      })
    ).items,
  ).toHaveLength(1);
  expect(
    (await timeline(db.pool, p.b.session, { kind: "patient" })).items,
  ).toHaveLength(2);
  expect(
    (
      await timeline(db.pool, doctor.session, {
        kind: "direct",
        connectionId: connection,
      })
    ).items,
  ).toHaveLength(1);
  expect(
    (
      await lookupPeople(db.pool, reviewer.session, reviewer.contextId, {
        exactAlias: alias,
      })
    )[0].personId,
  ).toBe(p.b.personId);
  await expect(
    transaction((tx) => verifySession(tx, p.a.session), db.pool),
  ).rejects.toThrow("SESSION_RETIRED");
  const newer = await report(p.b, "Synthetic post-merge symptom");
  const preview = await previewReversal(
    db.pool,
    reviewer.session,
    p.input.operationId,
  );
  expect(preview.inventory.records.some((r) => r.id === newer.eventId)).toBe(
    true,
  );
  await reverseMerge(db.pool, reviewer.session, {
    mergeOperationId: p.input.operationId,
    operationId: randomUUID(),
    reviewToken: preview.reviewToken,
    evidence: "Synthetic reviewed origin disposition including later records",
    reviewedLaterWork: true,
  });
  expect(
    (await timeline(db.pool, p.b.session, { kind: "patient" })).items,
  ).toHaveLength(2);
  expect(
    (
      await db.pool.query(
        "select count(*) n from mhistree.contributions where patient_person_id=any($1::uuid[])",
        [[p.a.personId, p.b.personId]],
      )
    ).rows[0].n,
  ).toBe("3");
  expect(
    (
      await lookupPeople(db.pool, reviewer.session, reviewer.contextId, {
        exactAlias: alias,
      })
    )[0].personId,
  ).toBe(p.a.personId);
  await expect(
    transaction((tx) => verifySession(tx, p.a.session), db.pool),
  ).rejects.toThrow("SESSION_RETIRED");
  await expect(
    conversationHistory(db.pool, p.b.session, conversation),
  ).rejects.toThrow("ACCESS_DENIED");
  const provider = new KeycloakProvider(
    JSON.parse(await readFile(".local/auth-config.json", "utf8")),
  );
  const recoveryInput = {
    personId: p.a.personId,
    contextId: reviewer.contextId,
    purpose: "activation",
    evidenceReference: "Synthetic reviewed post-reversal ownership check",
  };
  await expect(
    issueCredential(db.pool, provider, reviewer.session, recoveryInput),
  ).rejects.toThrow("IDENTITY_REVIEW_REQUIRED");
  const recovery = await issueCredential(db.pool, provider, reviewer.session, {
    ...recoveryInput,
    purpose: "recovery",
  });
  const setup = await redeemCredential(db.pool, recovery.code, randomUUID());
  const password = `Synthetic-${randomUUID()}!`;
  const renewed = await completeSetup(
    db.pool,
    provider,
    setup.setupSession,
    password,
    randomUUID(),
  );
  const login = await signIn(
    db.pool,
    provider,
    renewed.loginIdentifier,
    password,
    randomUUID(),
  );
  expect(
    await readPrivateOriginal(
      db.pool,
      login.session,
      { kind: "patient" },
      document.source_id,
      store,
    ),
  ).toEqual(original);
  expect(
    (await timeline(db.pool, login.session, { kind: "patient" })).items,
  ).toHaveLength(1);
  expect(
    (
      await db.pool.query("select status from mhistree.accounts where id=$1", [
        p.a.accountId,
      ])
    ).rows[0].status,
  ).toBe("retired");
});
it("reversal rejects stale later-work review without partially separating identities", async () => {
  const p = await pair();
  await mergeIdentities(db.pool, reviewer.session, p.input);
  const preview = await previewReversal(
    db.pool,
    reviewer.session,
    p.input.operationId,
  );
  await report(p.b, "Synthetic report after reversal preview");
  await expect(
    reverseMerge(db.pool, reviewer.session, {
      mergeOperationId: p.input.operationId,
      operationId: randomUUID(),
      reviewToken: preview.reviewToken,
      evidence: "Synthetic stale reversal review evidence",
      reviewedLaterWork: true,
    }),
  ).rejects.toThrow("VERSION_CONFLICT");
  expect(
    (
      await db.pool.query(
        "select canonical_person_id from mhistree.persons where id=$1",
        [p.a.personId],
      )
    ).rows[0].canonical_person_id,
  ).toBe(p.b.personId);
  expect(
    (
      await db.pool.query(
        "select count(*) n from mhistree.merge_reversals where merge_operation_id=$1",
        [p.input.operationId],
      )
    ).rows[0].n,
  ).toBe("0");
});
it("a changed survivor decision or failed merge transaction cannot leave a partial mapping or retired account", async () => {
  const p = await pair();
  await db.pool.query(
    "create function mhistree.fail_merge_test() returns trigger language plpgsql as $$begin if new.kind='identity.mapping.invalidated' then raise exception 'SYNTHETIC_MERGE_FAILURE';end if;return new;end;$$;create trigger fail_merge_test before insert on mhistree.outbox for each row execute function mhistree.fail_merge_test()",
  );
  await expect(
    mergeIdentities(db.pool, reviewer.session, p.input),
  ).rejects.toThrow("SYNTHETIC_MERGE_FAILURE");
  await db.pool.query(
    "drop trigger fail_merge_test on mhistree.outbox;drop function mhistree.fail_merge_test()",
  );
  expect(
    (
      await db.pool.query(
        "select canonical_person_id from mhistree.persons where id=$1",
        [p.a.personId],
      )
    ).rows[0].canonical_person_id,
  ).toBeNull();
  await transaction((tx) => verifySession(tx, p.a.session), db.pool);
  await db.pool.query(
    "update mhistree.accounts set last_successful_patient_login_at=clock_timestamp() where id=$1",
    [p.a.accountId],
  );
  await expect(
    mergeIdentities(db.pool, reviewer.session, p.input),
  ).rejects.toThrow("IDENTITY_REVIEW_REQUIRED");
});
