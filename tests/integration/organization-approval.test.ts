import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import {
  registerOrganization,
  reviewOrganization,
  organizationReviewQueue,
  requireOrganization,
  myOrganizations,
} from "@/features/organizations/server";
import { transaction } from "@/lib/db/client";
let db: Awaited<ReturnType<typeof testDatabase>>;
let applicant: Awaited<ReturnType<typeof staffFixture>>,
  reviewer: typeof applicant,
  outsider: typeof applicant;
let organizationId: string;
beforeAll(async () => {
  db = await testDatabase();
  applicant = await staffFixture(db.pool, []);
  reviewer = await staffFixture(db.pool, []);
  outsider = await staffFixture(db.pool, []);
  await db.pool.query(
    "insert into mhistree.staff_authorities(account_id,context_id,privileges,evidence_reference) values($1,'review:organizations','{organization.review}','Synthetic designated reviewer')",
    [reviewer.accountId],
  );
});
afterAll(async () => {
  await db?.stop();
});
it("registration is idempotent and pending status grants no management or review authority", async () => {
  const d = {
    legalName: "Synthetic hospital",
    registrationNumber: "TEST-ORG-1",
    jurisdiction: "Synthetic registry",
    address: "Synthetic test address",
    administratorCapacity: "Synthetic authorized applicant",
    requestKey: randomUUID(),
  };
  const results = await Promise.all([
    registerOrganization(db.pool, applicant.session, d),
    registerOrganization(db.pool, applicant.session, d),
  ]);
  organizationId = results[0].id;
  expect(results[1].id).toBe(organizationId);
  await expect(
    transaction(
      (tx) =>
        requireOrganization(
          tx,
          applicant.session,
          organizationId,
          "organization.manage",
        ),
      db.pool,
    ),
  ).rejects.toThrow("ACCESS_DENIED");
  await expect(
    organizationReviewQueue(db.pool, applicant.session),
  ).rejects.toThrow("ACCESS_DENIED");
  expect(await myOrganizations(db.pool, outsider.session)).toHaveLength(0);
  await expect(
    registerOrganization(db.pool, outsider.session, d),
  ).rejects.toThrow("VERSION_CONFLICT");
});
it("independent evidence-based review grants only administration; suspension denies it and reviews are retained", async () => {
  const d = {
    organizationId,
    version: 1,
    decision: "approved",
    evidence: "Synthetic registry verification evidence",
    administratorEvidence:
      "Synthetic administrator identity and authorization evidence",
  };
  await expect(
    reviewOrganization(db.pool, applicant.session, d),
  ).rejects.toThrow("ACCESS_DENIED");
  await reviewOrganization(db.pool, reviewer.session, d);
  await transaction(
    (tx) =>
      requireOrganization(
        tx,
        applicant.session,
        organizationId,
        "organization.manage",
      ),
    db.pool,
  );
  await expect(
    transaction(
      (tx) =>
        requireOrganization(
          tx,
          outsider.session,
          organizationId,
          "organization.manage",
        ),
      db.pool,
    ),
  ).rejects.toThrow("ACCESS_DENIED");
  await expect(
    transaction(
      (tx) =>
        requireOrganization(
          tx,
          applicant.session,
          organizationId,
          "records.write",
        ),
      db.pool,
    ),
  ).rejects.toThrow("ACCESS_DENIED");
  await expect(
    reviewOrganization(db.pool, reviewer.session, d),
  ).rejects.toThrow("VERSION_CONFLICT");
  await reviewOrganization(db.pool, reviewer.session, {
    ...d,
    version: 2,
    decision: "suspended",
  });
  await expect(
    transaction(
      (tx) =>
        requireOrganization(
          tx,
          applicant.session,
          organizationId,
          "organization.manage",
        ),
      db.pool,
    ),
  ).rejects.toThrow("ACCESS_DENIED");
  expect(
    (
      await db.pool.query(
        "select count(*) n from mhistree.organization_reviews",
      )
    ).rows[0].n,
  ).toBe("2");
  expect(
    (
      await db.pool.query(
        "select count(*) n from mhistree.notifications where kind='organization.status'",
      )
    ).rows[0].n,
  ).toBe("2");
});
