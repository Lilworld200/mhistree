import { beforeAll, afterAll, it, expect } from "vitest";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import {
  accountProfile,
  updateProfile,
  addContact,
  removeContact,
} from "@/features/patient/account/server";
let db: Awaited<ReturnType<typeof testDatabase>>,
  owner: Awaited<ReturnType<typeof staffFixture>>,
  other: typeof owner;
beforeAll(async () => {
  db = await testDatabase();
  owner = await staffFixture(db.pool);
  other = await staffFixture(db.pool);
  await db.pool.query(
    "insert into mhistree.patient_identifiers(alias,person_id,origin_person_id,retired_at) values('MH-retired',$1,$1,clock_timestamp())",
    [owner.personId],
  );
  await db.pool.query(
    "insert into mhistree.patient_identifiers(alias,person_id,origin_person_id) values('MH-owner',$1,$1),('MH-other',$2,$2)",
    [owner.personId, other.personId],
  );
});
afterAll(async () => {
  await db?.stop();
});
it("projects the current person's active patient locator separately from account and login identifiers", async () => {
  const profile = await accountProfile(db.pool, owner.session);
  expect(profile.patientId).toBe("MH-owner");
  expect(profile.patientId).not.toBe(profile.accountId);
  expect(profile.loginEmail).toBeNull();
  expect((await accountProfile(db.pool, other.session)).patientId).toBe(
    "MH-other",
  );
});
it("profile edits remain owner-only, versioned and cannot change patient locators", async () => {
  const profile = await accountProfile(db.pool, owner.session);
  await expect(
    updateProfile(db.pool, owner.session, {
      displayName: "Changed",
      birthDate: null,
      version: profile.profile_version,
      patientId: "MH-other",
    }),
  ).rejects.toThrow();
  await updateProfile(db.pool, owner.session, {
    displayName: "Changed",
    birthDate: "1995-03-12",
    version: profile.profile_version,
  });
  await expect(
    updateProfile(db.pool, owner.session, {
      displayName: "Lost edit",
      birthDate: null,
      version: profile.profile_version,
    }),
  ).rejects.toThrow("VERSION_CONFLICT");
  expect((await accountProfile(db.pool, owner.session)).patientId).toBe(
    "MH-owner",
  );
  expect((await accountProfile(db.pool, other.session)).display_name).not.toBe(
    "Changed",
  );
});

it("separates the actual login email from optional contacts and protects its removal", async () => {
  await db.pool.query(
    "update mhistree.accounts set provider='supabase',login_identifier='profile-login@example.test' where id=$1",
    [owner.accountId],
  );
  const primary = (
    await db.pool.query(
      "insert into mhistree.contacts(person_id,kind,address,verified_at) values($1,'email','profile-login@example.test',clock_timestamp()) returning id",
      [owner.personId],
    )
  ).rows[0];
  await addContact(db.pool, owner.session, {
    kind: "email",
    address: "optional-profile@example.test",
  });
  const profile = await accountProfile(db.pool, owner.session);
  expect(profile.loginEmail).toBe("profile-login@example.test");
  expect(
    profile.contacts.find(
      (contact: { address: string; verified_at: string | null }) =>
        contact.address === "optional-profile@example.test",
    )?.verified_at,
  ).toBeNull();
  await expect(
    removeContact(db.pool, owner.session, primary.id),
  ).rejects.toThrow("ACCESS_DENIED");
  expect(
    (await accountProfile(db.pool, owner.session)).contacts.some(
      (contact: { id: string }) => contact.id === primary.id,
    ),
  ).toBe(true);
});
