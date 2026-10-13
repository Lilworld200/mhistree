import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { staffFixture } from "../helpers/fixtures";
import { secret } from "@/features/auth/sessions";
import { testDatabase } from "../helpers/postgres";
import { registerPerson, lookupPeople } from "@/features/identity/server";

describe("T07 real PostgreSQL identity", () => {
  let db: Awaited<ReturnType<typeof testDatabase>>;
  let actor: Awaited<ReturnType<typeof staffFixture>>;
  beforeAll(async () => {
    db = await testDatabase();
    actor = await staffFixture(db.pool);
  });
  afterAll(async () => {
    await db?.stop();
  });
  it("stores an attributed person without contacts or account; care can reference the permanent key", async () => {
    const p = await registerPerson(db.pool, actor.session, actor.contextId, {
      displayName: "Synthetic no-contact patient",
    });
    const { rows } = await db.pool.query(
      `select p.*, (select count(*) from mhistree.accounts a where a.person_id=p.id)::int accounts, (select count(*) from mhistree.contacts c where c.person_id=p.id)::int contacts from mhistree.persons p where p.id=$1`,
      [p.personId],
    );
    expect(rows[0]).toMatchObject({
      creator_account_id: actor.accountId,
      original_context: actor.contextId,
      birth_date: null,
      accounts: 0,
      contacts: 0,
    });
    await db.pool.query(
      `create table mhistree.synthetic_care_fixture(person_id uuid references mhistree.persons(id), description text)`,
    );
    await db.pool.query(
      `insert into mhistree.synthetic_care_fixture values($1,'Synthetic care, not a clinical record')`,
      [p.personId],
    );
    const found = await lookupPeople(db.pool, actor.session, actor.contextId, {
      exactAlias: p.alias,
    });
    expect(found).toHaveLength(1);
    expect(Object.keys(found[0]).sort()).toEqual([
      "birthDate",
      "displayName",
      "personId",
      "reviewRequired",
    ]);
    await expect(
      db.pool.query(
        `update mhistree.persons set original_context='other' where id=$1`,
        [p.personId],
      ),
    ).rejects.toThrow("IMMUTABLE_ORIGIN");
  });
  it("never auto-links matching names or shared contact details", async () => {
    const input = {
      displayName: "Shared Synthetic Name",
      contacts: [{ kind: "phone", address: "+2340000000000" }],
    };
    const [a, b] = await Promise.all([
      registerPerson(db.pool, actor.session, actor.contextId, input),
      registerPerson(db.pool, actor.session, actor.contextId, input),
    ]);
    expect(a.personId).not.toBe(b.personId);
    expect(
      (
        await lookupPeople(db.pool, actor.session, actor.contextId, {
          namePrefix: "Shared",
        })
      ).length,
    ).toBe(2);
  });
  it("denies unknown staff and never exposes history from an alias", async () => {
    await expect(
      lookupPeople(db.pool, secret(), actor.contextId, {
        exactAlias: "guessed",
      }),
    ).rejects.toThrow("SESSION_RETIRED");
    expect(
      await lookupPeople(db.pool, actor.session, actor.contextId, {
        exactAlias: "guessed",
      }),
    ).toEqual([]);
    await expect(
      registerPerson(db.pool, actor.session, actor.contextId, {
        displayName: "Test",
        role: "admin",
      }),
    ).rejects.toThrow();
  });
  it("rate limits lookup and retains an immutable audit", async () => {
    let limited = false;
    for (let i = 0; i < 21; i++) {
      try {
        await lookupPeople(db.pool, actor.session, actor.contextId, {
          exactAlias: "missing",
        });
      } catch (e) {
        expect((e as Error).message).toBe("RATE_LIMITED");
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
    await expect(
      db.pool.query("delete from mhistree.audit_events"),
    ).rejects.toThrow("IMMUTABLE_HISTORY");
  });
});
