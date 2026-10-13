import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import {
  flagDuplicate,
  duplicatePreview,
  reviewDuplicate,
  duplicateQueue,
  chooseSurvivor,
} from "@/features/identity/duplicates";
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  db = await testDatabase();
});
afterAll(async () => {
  await db?.stop();
});
it("limited duplicate report does not disclose clinical history or give ordinary staff approval authority", async () => {
  const patient = await staffFixture(db.pool),
    candidate = await staffFixture(db.pool),
    reviewer = await staffFixture(db.pool);
  await db.pool.query(
    "insert into mhistree.staff_authorities(account_id,context_id,privileges,evidence_reference) values($1,'review:identity','{identity.review}','Synthetic reviewer')",
    [reviewer.accountId],
  );
  const alias = `MH-${randomUUID()}`;
  await db.pool.query(
    "insert into mhistree.patient_identifiers(alias,person_id,origin_person_id) values($1,$2,$2)",
    [alias, candidate.personId],
  );
  const c = await flagDuplicate(db.pool, patient.session, {
    personId: patient.personId,
    candidateId: alias,
    reason: "Synthetic possible duplicate for identity review",
  });
  expect(Object.keys(c)).toEqual(["id"]);
  await expect(duplicateQueue(db.pool, patient.session)).rejects.toThrow(
    "ACCESS_DENIED",
  );
  const preview = await duplicatePreview(db.pool, reviewer.session, c.id);
  expect(preview.survivorId).toBeNull();
  expect(preview).not.toHaveProperty("history");
  await expect(
    reviewDuplicate(db.pool, reviewer.session, {
      id: c.id,
      version: 1,
      decision: "approved",
      identityEvidence: "Synthetic ownership remains uncertain",
      ownershipVerified: false,
      expectedSurvivorId: null,
    }),
  ).rejects.toThrow("IDENTITY_REVIEW_REQUIRED");
  await reviewDuplicate(db.pool, reviewer.session, {
    id: c.id,
    version: 1,
    decision: "escalated",
    identityEvidence: "Synthetic missing patient login evidence",
    ownershipVerified: false,
    expectedSurvivorId: null,
  });
  expect(
    (
      await db.pool.query(
        "select canonical_person_id from mhistree.persons where id=$1",
        [candidate.personId],
      )
    ).rows[0].canonical_person_id,
  ).toBeNull();
});
it("survivor rule handles sole activation, oldest identity, recent patient login and ambiguous ties", () => {
  const left = randomUUID(),
    right = randomUUID(),
    people = [
      { id: left, created_at: "2020-01-01", canonical_person_id: null },
      { id: right, created_at: "2021-01-01", canonical_person_id: null },
    ];
  expect(chooseSurvivor({ people, accounts: [] })).toBe(left);
  const accounts = [
    {
      id: randomUUID(),
      person_id: right,
      status: "active",
      last_successful_patient_login_at: null,
    },
  ];
  expect(chooseSurvivor({ people, accounts })).toBe(right);
  const both = [
    { ...accounts[0], last_successful_patient_login_at: "2026-10-11" },
    {
      id: randomUUID(),
      person_id: left,
      status: "active",
      last_successful_patient_login_at: "2026-10-10",
    },
  ];
  expect(chooseSurvivor({ people, accounts: both })).toBe(right);
  expect(
    chooseSurvivor({
      people,
      accounts: both.map((a) => ({
        ...a,
        last_successful_patient_login_at: "2026-10-11",
      })),
    }),
  ).toBeNull();
});
