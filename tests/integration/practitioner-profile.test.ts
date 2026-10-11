import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import {
  submitProfessional,
  reviewProfessional,
  reviewQueue,
  requirePractitioner,
  professionalProfile,
  credentialDownload,
} from "@/features/practitioner/profile";
import { transaction } from "@/lib/db/client";
let db: Awaited<ReturnType<typeof testDatabase>>,
  applicant: Awaited<ReturnType<typeof staffFixture>>,
  reviewer: Awaited<ReturnType<typeof staffFixture>>;
let applicationId: string;
beforeAll(async () => {
  db = await testDatabase();
  applicant = await staffFixture(db.pool, []);
  reviewer = await staffFixture(db.pool, []);
  await db.pool.query(
    "delete from mhistree.professionals where account_id=$1",
    [applicant.accountId],
  );
  await db.pool.query(
    "insert into mhistree.staff_authorities(account_id,context_id,privileges,evidence_reference) values($1,'review:professionals','{professional.review}','synthetic reviewer appointment')",
    [reviewer.accountId],
  );
});
afterAll(async () => {
  await db?.stop();
});
it("same account submits private credential; cannot self-verify or use clinical workspace while pending", async () => {
  const input = {
    legalName: "Synthetic applicant",
    profession: "Physician",
    registrationNumber: "TEST-001",
    jurisdiction: "Synthetic test authority",
    filename: "credential.pdf",
    base64: Buffer.from(
      "%PDF-1.4\nSynthetic credential fixture\n%%EOF",
    ).toString("base64"),
    requestKey: randomUUID(),
  };
  const result = await submitProfessional(db.pool, applicant.session, input);
  applicationId = result.id;
  expect((await submitProfessional(db.pool, applicant.session, input)).id).toBe(
    applicationId,
  );
  expect(
    (await professionalProfile(db.pool, applicant.session)).profile.status,
  ).toBe("pending");
  await expect(
    transaction((tx) => requirePractitioner(tx, applicant.session), db.pool),
  ).rejects.toThrow("ACCESS_DENIED");
  await expect(reviewQueue(db.pool, applicant.session)).rejects.toThrow(
    "ACCESS_DENIED",
  );
  await expect(
    credentialDownload(db.pool, applicant.session, applicationId),
  ).rejects.toThrow("ACCESS_DENIED");
  expect(
    (await credentialDownload(db.pool, reviewer.session, applicationId)).length,
  ).toBeGreaterThan(5);
});
it("review requires privileged independent human and evidence; approval enables same account, suspension removes access", async () => {
  const input = {
    applicationId,
    version: 1,
    decision: "approved",
    authorityUrl: "https://example.org/synthetic-registry",
    evidence: "Synthetic test-only authoritative registration verification.",
    privileges: ["records.read", "records.write", "person.lookup"],
  };
  await expect(
    reviewProfessional(db.pool, applicant.session, input),
  ).rejects.toThrow("ACCESS_DENIED");
  await reviewProfessional(db.pool, reviewer.session, input);
  expect(
    (
      await transaction(
        (tx) => requirePractitioner(tx, applicant.session),
        db.pool,
      )
    ).accountId,
  ).toBe(applicant.accountId);
  await expect(
    reviewProfessional(db.pool, reviewer.session, input),
  ).rejects.toThrow("VERSION_CONFLICT");
  await reviewProfessional(db.pool, reviewer.session, {
    ...input,
    version: 2,
    decision: "suspended",
    privileges: [],
  });
  await expect(
    transaction((tx) => requirePractitioner(tx, applicant.session), db.pool),
  ).rejects.toThrow("ACCESS_DENIED");
  expect(
    (
      await db.pool.query(
        "select count(*) n from mhistree.professional_reviews",
      )
    ).rows[0].n,
  ).toBe("2");
});
