import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readPrivateOriginal } from "@/features/access/private-files";
import { registerPerson } from "@/features/identity/server";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import {
  recordSource,
  acceptContribution,
  readContribution,
} from "@/features/health-records/server";
import {
  withAccess,
  revokeConnection,
  preparePublication,
  recheckPublication,
  type ActingContext,
  type ResourcePolicy,
} from "@/features/access/server";

describe("T09 real authorization, RLS and record transactions", () => {
  let db: Awaited<ReturnType<typeof testDatabase>>;
  let patient: Awaited<ReturnType<typeof staffFixture>>,
    otherPatient: typeof patient,
    doctor: typeof patient,
    otherDoctor: typeof patient;
  let direct: ActingContext,
    organization: ActingContext,
    secondOrg: ActingContext;
  let eventId: string, logicalId: string;
  const allCategories = [
    "ongoing",
    "allergy",
    "clinical",
    "result",
    "document",
  ];
  beforeAll(async () => {
    db = await testDatabase();
    patient = await staffFixture(db.pool);
    otherPatient = await staffFixture(db.pool);
    doctor = await staffFixture(db.pool);
    otherDoctor = await staffFixture(db.pool);
    const connection = randomUUID();
    await db.pool.query(
      "insert into mhistree.connections(id,patient_person_id,kind,practitioner_account_id,status) values($1,$2,'direct',$3,'active')",
      [connection, patient.personId, doctor.accountId],
    );
    await db.pool.query(
      "insert into mhistree.consents(connection_id,categories,origin_person_ids,origin_context_ids,method,responsible_account_id) values($1,$2,$3,'{*}','login',$4)",
      [connection, allCategories, [patient.personId], patient.accountId],
    );
    direct = { kind: "direct", connectionId: connection };
    for (let i = 0; i < 2; i++) {
      const org = randomUUID(),
        conn = randomUUID(),
        assignment = randomUUID(),
        person = i === 0 ? patient : otherPatient;
      await db.pool.query(
        "insert into mhistree.organizations(id,status) values($1,'approved')",
        [org],
      );
      await db.pool.query(
        "insert into mhistree.memberships(organization_id,account_id,active,privileges) values($1,$2,true,'{records.read,records.write}')",
        [org, doctor.accountId],
      );
      await db.pool.query(
        "insert into mhistree.connections(id,patient_person_id,kind,organization_id,status) values($1,$2,'organization',$3,'active')",
        [conn, person.personId, org],
      );
      await db.pool.query(
        "insert into mhistree.consents(connection_id,categories,origin_person_ids,origin_context_ids,method,responsible_account_id) values($1,$2,$3,'{*}','login',$4)",
        [conn, allCategories, [person.personId], person.accountId],
      );
      await db.pool.query(
        "insert into mhistree.assignments(id,organization_id,patient_person_id,account_id,active,categories) values($1,$2,$3,$4,true,'{ongoing,clinical,document}')",
        [assignment, org, person.personId, doctor.accountId],
      );
      const selection = {
        kind: "organization" as const,
        connectionId: conn,
        organizationId: org,
        assignmentId: assignment,
      };
      if (i === 0) organization = selection;
      else secondOrg = selection;
    }
  });
  afterAll(async () => {
    await db?.stop();
  });
  async function source(
    session = patient.session,
    context: ActingContext = { kind: "patient" },
    category = "ongoing",
    visibility = "finalized",
  ) {
    return recordSource(db.pool, session, context, {
      patientPersonId: patient.personId,
      category,
      visibility,
      sourceTimezone: "Africa/Lagos",
      content: "Synthetic source evidence",
      clientKey: randomUUID(),
    });
  }
  function contribution(s: { sourceId: string; version: number }) {
    return {
      sourceId: s.sourceId,
      sourceVersion: s.version,
      sourceItemId: "synthetic-item-1",
      operationKey: randomUUID(),
      body: { text: "Synthetic ongoing issue" },
      occurredAt: { precision: "unknown" },
      status: "unknown",
      sourceSpans: ["Synthetic source evidence"],
    };
  }
  it("accepts event/current-state/audit/outbox atomically and deduplicates concurrent retries", async () => {
    const input = contribution(await source());
    const [a, b] = await Promise.all([
      acceptContribution(db.pool, patient.session, { kind: "patient" }, input),
      acceptContribution(db.pool, patient.session, { kind: "patient" }, input),
    ]);
    expect(a.eventId).toBe(b.eventId);
    expect([a.replayed, b.replayed].sort()).toEqual([false, true]);
    eventId = a.eventId;
    const row = await readContribution(
      db.pool,
      patient.session,
      { kind: "patient" },
      eventId,
    );
    logicalId = row.logical_id;
    expect(
      (
        await db.pool.query(
          "select event_id from mhistree.persistent_state where logical_id=$1",
          [logicalId],
        )
      ).rows[0].event_id,
    ).toBe(eventId);
    expect(
      (
        await db.pool.query(
          "select count(*)::int n from mhistree.outbox where reference_id=$1",
          [eventId],
        )
      ).rows[0].n,
    ).toBe(1);
    const alternate = await acceptContribution(
      db.pool,
      patient.session,
      { kind: "patient" },
      { ...input, operationKey: randomUUID() },
    );
    expect(alternate.eventId).toBe(eventId);
    await expect(
      acceptContribution(
        db.pool,
        patient.session,
        { kind: "patient" },
        { ...input, body: { text: "different" } },
      ),
    ).rejects.toThrow("VERSION_CONFLICT");
  });
  it("denies cross-patient, tampered role, cross-org and unconnected practitioner access", async () => {
    await expect(
      readContribution(
        db.pool,
        otherPatient.session,
        { kind: "patient" },
        eventId,
      ),
    ).rejects.toThrow("ACCESS_DENIED");
    await expect(
      withAccess(
        db.pool,
        patient.session,
        { kind: "patient", role: "admin" },
        async () => true,
      ),
    ).rejects.toThrow();
    await expect(
      readContribution(db.pool, doctor.session, secondOrg, eventId),
    ).rejects.toThrow("ACCESS_DENIED");
    await expect(
      readContribution(db.pool, otherDoctor.session, direct, eventId),
    ).rejects.toThrow("ACCESS_DENIED");
    expect(
      (await readContribution(db.pool, doctor.session, direct, eventId)).id,
    ).toBe(eventId);
    expect(
      (await readContribution(db.pool, doctor.session, organization, eventId))
        .id,
    ).toBe(eventId);
  });
  it("enforces assignment ceilings, qualification and administration separation", async () => {
    const allergy = await acceptContribution(
      db.pool,
      patient.session,
      { kind: "patient" },
      contribution(
        await source(patient.session, { kind: "patient" }, "allergy"),
      ),
    );
    await expect(
      readContribution(db.pool, doctor.session, organization, allergy.eventId),
    ).rejects.toThrow("ACCESS_DENIED");
    expect(
      (await readContribution(db.pool, doctor.session, direct, allergy.eventId))
        .id,
    ).toBe(allergy.eventId);
    await db.pool.query(
      "update mhistree.professionals set status='suspended' where account_id=$1",
      [doctor.accountId],
    );
    await expect(
      readContribution(db.pool, doctor.session, direct, eventId),
    ).rejects.toThrow("ACCESS_DENIED");
    await db.pool.query(
      "update mhistree.professionals set status='approved' where account_id=$1",
      [doctor.accountId],
    );
    if (organization.kind !== "organization") throw new Error("fixture");
    await db.pool.query(
      "update mhistree.memberships set privileges='{organization.admin}' where organization_id=$1",
      [organization.organizationId],
    );
    await expect(
      readContribution(db.pool, doctor.session, organization, eventId),
    ).rejects.toThrow("ACCESS_DENIED");
    await db.pool.query(
      "update mhistree.memberships set privileges='{records.read,records.write}' where organization_id=$1",
      [organization.organizationId],
    );
  });
  it("keeps private notes/drafts outside patient/shared history and prevents professional rewrites", async () => {
    for (const visibility of ["private", "draft"]) {
      const entry = await acceptContribution(
        db.pool,
        doctor.session,
        direct,
        contribution(
          await source(doctor.session, direct, "clinical", visibility),
        ),
      );
      expect(
        (await readContribution(db.pool, doctor.session, direct, entry.eventId))
          .id,
      ).toBe(entry.eventId);
      await expect(
        readContribution(
          db.pool,
          patient.session,
          { kind: "patient" },
          entry.eventId,
        ),
      ).rejects.toThrow("ACCESS_DENIED");
      await expect(
        readContribution(db.pool, doctor.session, organization, entry.eventId),
      ).rejects.toThrow("ACCESS_DENIED");
    }
    const finalized = await acceptContribution(
      db.pool,
      doctor.session,
      direct,
      contribution(await source(doctor.session, direct, "ongoing")),
    );
    const row = await readContribution(
      db.pool,
      patient.session,
      { kind: "patient" },
      finalized.eventId,
    );
    await expect(
      acceptContribution(
        db.pool,
        patient.session,
        { kind: "patient" },
        {
          ...contribution(await source()),
          correction: { logicalId: row.logical_id, expectedVersion: 1 },
        },
      ),
    ).rejects.toThrow("ACCESS_DENIED");
  });
  it("rolls back event/state/audit/outbox together on database failure", async () => {
    const input = contribution(await source());
    const before = (
      await db.pool.query(
        "select (select count(*)::int from mhistree.contributions) e,(select count(*)::int from mhistree.audit_events) a,(select count(*)::int from mhistree.outbox) o",
      )
    ).rows[0];
    await db.pool.query(
      "create function mhistree.synthetic_fail() returns trigger language plpgsql as $$begin raise exception 'SYNTHETIC_FAILURE';end;$$; create trigger synthetic_fail before insert on mhistree.persistent_state for each row execute function mhistree.synthetic_fail()",
    );
    await expect(
      acceptContribution(db.pool, patient.session, { kind: "patient" }, input),
    ).rejects.toThrow("SYNTHETIC_FAILURE");
    await db.pool.query(
      "drop trigger synthetic_fail on mhistree.persistent_state",
    );
    const after = (
      await db.pool.query(
        "select (select count(*)::int from mhistree.contributions) e,(select count(*)::int from mhistree.audit_events) a,(select count(*)::int from mhistree.outbox) o",
      )
    ).rows[0];
    expect(after).toEqual(before);
    await acceptContribution(
      db.pool,
      patient.session,
      { kind: "patient" },
      input,
    );
  });
  it("retains corrected versions and rejects concurrent stale corrections", async () => {
    const a = {
      ...contribution(await source()),
      correction: { logicalId, expectedVersion: 1 },
    };
    const b = {
      ...contribution(await source()),
      correction: { logicalId, expectedVersion: 1 },
    };
    const results = await Promise.allSettled([
      acceptContribution(db.pool, patient.session, { kind: "patient" }, a),
      acceptContribution(db.pool, patient.session, { kind: "patient" }, b),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (results.find((r) => r.status === "rejected") as PromiseRejectedResult)
        .reason.message,
    ).toBe("VERSION_CONFLICT");
    expect(
      (
        await db.pool.query(
          "select count(*)::int n from mhistree.contributions where logical_id=$1",
          [logicalId],
        )
      ).rows[0].n,
    ).toBe(2);
    expect(
      (
        await db.pool.query(
          "select e.version from mhistree.persistent_state s join mhistree.contributions e on e.id=s.event_id where s.logical_id=$1",
          [logicalId],
        )
      ).rows[0].version,
    ).toBe(2);
  });
  it("blocks raw SQL without current context and preserves original grant partitions", async () => {
    const client = await db.pool.connect();
    try {
      await client.query("begin;set local role mhistree_runtime");
      expect(
        (await client.query("select * from mhistree.contributions")).rowCount,
      ).toBe(0);
      await client.query("rollback");
    } finally {
      client.release();
    }
    await db.pool.query("create role synthetic_anon nologin");
    const anon = await db.pool.connect();
    try {
      await anon.query("begin;set local role synthetic_anon");
      await expect(
        anon.query("select * from mhistree.sources"),
      ).rejects.toThrow("permission denied");
      await anon.query("rollback");
    } finally {
      anon.release();
    }
    // A post-merge-shaped fixture: current patient key is survivor, origin remains another person.
    const moved = randomUUID(),
      movedSource = randomUUID();
    await db.pool.query(
      `insert into mhistree.sources(id,patient_person_id,origin_person_id,author_account_id,original_context,category,visibility,source_status,source_timezone,content,client_key) select $1,s.patient_person_id,$2,s.author_account_id,s.original_context,s.category,s.visibility,s.source_status,s.source_timezone,s.content,$1 from mhistree.sources s join mhistree.contributions e on e.source_id=s.id where e.id=$3`,
      [movedSource, otherPatient.personId, eventId],
    );
    await db.pool.query(
      `insert into mhistree.contributions(id,logical_id,version,patient_person_id,origin_person_id,source_id,source_version,source_item_id,operation_kind,author_account_id,original_context,category,visibility,source_status,occurred_at,source_timezone,body,source_spans,status)
    select $1,$1,1,patient_person_id,$2,$4,source_version,'historical-origin','fixture',author_account_id,original_context,category,visibility,source_status,occurred_at,source_timezone,body,source_spans,status from mhistree.contributions where id=$3`,
      [moved, otherPatient.personId, eventId, movedSource],
    );
    await expect(
      readContribution(db.pool, doctor.session, direct, moved),
    ).rejects.toThrow("ACCESS_DENIED");
  });
  it("permits only attributed initial care for an unactivated person, never another origin", async () => {
    const unactivated = await registerPerson(
      db.pool,
      doctor.session,
      doctor.contextId,
      {
        displayName: "Synthetic Unactivated Care",
      },
    );
    const basis = randomUUID(),
      origin = `initial-care:${basis}`;
    await db.pool.query(
      "insert into mhistree.initial_care_bases(id,patient_person_id,account_id,categories,origin_context,evidence_reference,active) values($1,$2,$3,'{clinical}',$4,'synthetic-in-person-check',true)",
      [basis, unactivated.personId, doctor.accountId, origin],
    );
    await db.pool.query(
      "insert into mhistree.staff_authorities(account_id,context_id,privileges,evidence_reference) values($1,$2,'{person.register}','synthetic-registration')",
      [doctor.accountId, origin],
    );
    const context: ActingContext = {
      kind: "initial-care",
      basisId: basis,
      organizationId: null,
      assignmentId: null,
    };
    const s = await recordSource(db.pool, doctor.session, context, {
      patientPersonId: unactivated.personId,
      category: "clinical",
      sourceTimezone: "Africa/Lagos",
      content: "Synthetic initial care",
      clientKey: randomUUID(),
    });
    const care = await acceptContribution(
      db.pool,
      doctor.session,
      context,
      contribution(s),
    );
    expect(
      (await readContribution(db.pool, doctor.session, context, care.eventId))
        .patient_person_id,
    ).toBe(unactivated.personId);
    await expect(
      readContribution(db.pool, doctor.session, context, eventId),
    ).rejects.toThrow("ACCESS_DENIED");
  });
  it("checks private originals before storage read and again after in-flight revocation", async () => {
    const s = await source(patient.session, { kind: "patient" }, "document");
    const bytes = new TextEncoder().encode("Synthetic private original");
    const storageKey = randomUUID();
    const fixtureFolder = resolve(".local/private-originals");
    await mkdir(fixtureFolder, { recursive: true });
    const fixturePath = resolve(fixtureFolder, storageKey);
    await writeFile(fixturePath, bytes);
    await db.pool.query(
      "insert into mhistree.private_files(source_id,storage_key,sha256,byte_length) values($1,$2,$3,$4)",
      [
        s.sourceId,
        storageKey,
        createHash("sha256").update(bytes).digest("hex"),
        bytes.length,
      ],
    );
    let reads = 0;
    const store = {
      read: async () => {
        reads++;
        return new Uint8Array(await readFile(fixturePath));
      },
    };
    await expect(
      readPrivateOriginal(
        db.pool,
        otherPatient.session,
        { kind: "patient" },
        s.sourceId,
        store,
      ),
    ).rejects.toThrow("ACCESS_DENIED");
    expect(reads).toBe(0);
    expect(
      await readPrivateOriginal(
        db.pool,
        patient.session,
        { kind: "patient" },
        s.sourceId,
        store,
      ),
    ).toEqual(bytes);
    if (organization.kind !== "organization") throw new Error("fixture");
    const connectionId = organization.connectionId;
    await expect(
      readPrivateOriginal(db.pool, doctor.session, organization, s.sourceId, {
        read: async () => {
          await revokeConnection(db.pool, patient.session, connectionId);
          return bytes;
        },
      }),
    ).rejects.toThrow("ACCESS_DENIED");
    await db.pool.query(
      "update mhistree.connections set status='active',revision=revision+1 where id=$1",
      [connectionId],
    );
  });
  it("revokes the next org operation/publication, pauses work, preserves independent direct access", async () => {
    const row = await readContribution(
      db.pool,
      doctor.session,
      organization,
      eventId,
    );
    const resource: ResourcePolicy = {
      patientPersonId: row.patient_person_id,
      originPersonId: row.origin_person_id,
      category: row.category,
      visibility: row.visibility,
      authorAccountId: row.author_account_id,
      originalContext: row.original_context,
      originalOrganizationId: row.original_organization_id,
    };
    const permit = await preparePublication(
      db.pool,
      doctor.session,
      organization,
      resource,
    );
    if (organization.kind !== "organization") throw new Error("fixture");
    await db.pool.query(
      "insert into mhistree.dependent_work(connection_id,state) values($1,'pending')",
      [organization.connectionId],
    );
    await revokeConnection(db.pool, patient.session, organization.connectionId);
    await expect(
      readContribution(db.pool, doctor.session, organization, eventId),
    ).rejects.toThrow("ACCESS_DENIED");
    await expect(recheckPublication(db.pool, permit)).rejects.toThrow(
      "ACCESS_DENIED",
    );
    expect(
      (await readContribution(db.pool, doctor.session, direct, eventId)).id,
    ).toBe(eventId);
    await db.pool.query(
      "update mhistree.connections set status='active',revision=revision+1 where id=$1",
      [organization.connectionId],
    );
    expect(
      (
        await db.pool.query(
          "select state from mhistree.dependent_work where connection_id=$1",
          [organization.connectionId],
        )
      ).rows[0].state,
    ).toBe("paused");
    await expect(recheckPublication(db.pool, permit)).rejects.toThrow(
      "ACCESS_REVOKED",
    );
    await db.pool.query(
      "update mhistree.memberships set active=false where organization_id=$1",
      [organization.organizationId],
    );
    await expect(
      readContribution(db.pool, doctor.session, organization, eventId),
    ).rejects.toThrow("ACCESS_DENIED");
    expect(
      (await readContribution(db.pool, doctor.session, direct, eventId)).id,
    ).toBe(eventId);
  });
  it("applies consent exclusions and blocks authors writing or reopening work after revocation", async () => {
    if (direct.kind !== "direct") throw new Error("fixture");
    const draftSource = await source(
      doctor.session,
      direct,
      "clinical",
      "draft",
    );
    const draft = await acceptContribution(
      db.pool,
      doctor.session,
      direct,
      contribution(draftSource),
    );
    const pending = await source(doctor.session, direct, "clinical", "draft");
    await db.pool.query(
      "insert into mhistree.consents(connection_id,categories,exclusions,origin_person_ids,origin_context_ids,method,responsible_account_id,predecessor_id) select connection_id,categories,'{ongoing}',origin_person_ids,origin_context_ids,'login',responsible_account_id,id from mhistree.consents where connection_id=$1 order by recorded_at desc,id desc limit 1",
      [direct.connectionId],
    );
    await expect(
      readContribution(db.pool, doctor.session, direct, eventId),
    ).rejects.toThrow("ACCESS_DENIED");
    await revokeConnection(db.pool, patient.session, direct.connectionId);
    await expect(
      readContribution(db.pool, doctor.session, direct, draft.eventId),
    ).rejects.toThrow("ACCESS_DENIED");
    await expect(
      acceptContribution(
        db.pool,
        doctor.session,
        direct,
        contribution(pending),
      ),
    ).rejects.toThrow("ACCESS_DENIED");
    await expect(source(doctor.session, direct, "clinical")).rejects.toThrow(
      "ACCESS_DENIED",
    );
    expect(
      (
        await readContribution(
          db.pool,
          patient.session,
          { kind: "patient" },
          eventId,
        )
      ).id,
    ).toBe(eventId);
    const runtime = await db.pool.connect();
    try {
      await runtime.query("begin;set local role mhistree_runtime");
      await expect(
        runtime.query("update mhistree.memberships set active=true"),
      ).rejects.toThrow("permission denied");
      await runtime.query("rollback");
    } finally {
      runtime.release();
    }
  });
});
