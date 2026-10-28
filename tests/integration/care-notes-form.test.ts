import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import { initiateDirectConnection } from "@/features/practitioner/patients";
import {
  saveCareNote,
  privateNotes,
} from "@/features/clinical-care/care-notes";
import {
  careNoteFields,
  type CareNoteCategory,
} from "@/features/clinical-care/care-note-schema";
import { readContribution } from "@/features/health-records/server";
import { healthState } from "@/features/health-records/current-state";
import { revokeConnection } from "@/features/access/server";
import {
  registerOrganizationPatient,
  establishInitialCare,
} from "@/features/organizations/care";
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  db = await testDatabase();
});
afterAll(async () => {
  await db?.stop();
});
async function fixture(
  categories = [
    "clinical",
    "medication-use",
    "prescription",
    "allergy",
    "ongoing",
    "baseline",
    "symptom",
    "activity",
  ],
) {
  const doctor = await staffFixture(db.pool),
    patient = await staffFixture(db.pool);
  const connection = (
    await initiateDirectConnection(db.pool, doctor.session, {
      patientPersonId: patient.personId,
      requestKey: randomUUID(),
      method: "in-person",
      categories,
      exclusions: [],
      evidence:
        "Synthetic patient identity and record scope confirmed in person.",
    })
  ).id as string;
  const context = { kind: "direct" as const, connectionId: connection };
  const input = (
    category: CareNoteCategory = "clinical",
    fields: Record<string, string> = {},
    destination: "note" | "record" = "record",
  ) => ({
    requestKey: randomUUID(),
    patientPersonId: patient.personId,
    destination,
    category,
    fields: careNoteFields.parse(fields),
    timezone: "Africa/Lagos",
    reviewed: destination === "record",
  });
  return {
    doctor,
    patient,
    context,
    connection,
    input,
    save: (value: unknown) =>
      saveCareNote(db.pool, doctor.session, context, value),
  };
}
it("keeps private notes author-only, retry-safe and out of Health and timeline", async () => {
  const f = await fixture(),
    d = f.input(
      "clinical",
      {
        title: "Follow-up thinking",
        content: "Private author context.\nNot a patient record.",
      },
      "note",
    );
  const saved = await f.save(d);
  expect((await f.save(d)).workId).toBe(saved.workId);
  const notes = await privateNotes(db.pool, f.doctor.session, f.context);
  expect(notes.items[0].body.text).toContain("Private author context");
  expect((await healthState(db.pool, f.patient.session)).items).toHaveLength(0);
  expect(
    (
      await db.pool.query(
        "select count(*) from mhistree.contributions where patient_person_id=$1",
        [f.patient.personId],
      )
    ).rows[0].count,
  ).toBe("0");
  await expect(
    privateNotes(db.pool, f.patient.session, f.context),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  const outsider = await staffFixture(db.pool);
  await expect(
    privateNotes(db.pool, outsider.session, f.context),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  await expect(
    f.save({
      ...d,
      fields: { ...d.fields, content: "Changed with an old request key" },
    }),
  ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
});
it("publishes each structured category atomically and keeps prescriptions separate from actual use", async () => {
  const f = await fixture();
  const values: [CareNoteCategory, Record<string, string>][] = [
    [
      "prescription",
      {
        name: "Synthetic medicine",
        dose: "10 mg",
        frequency: "once daily",
        route: "oral",
        indication: "For a symptom reviewed in this consultation.",
        plannedStart: "2026-01-03",
      },
    ],
    [
      "medication-use",
      {
        name: "Synthetic medicine",
        dose: "10 mg",
        frequency: "once daily",
        useStatus: "taking",
        indication: "For a symptom reviewed in this consultation.",
        actualStart: "2026-01-03",
      },
    ],
    [
      "ongoing",
      {
        name: "Synthetic condition",
        certainty: "suspected",
        status: "active",
        eventDate: "2026-01-02",
      },
    ],
    [
      "allergy",
      {
        name: "Synthetic substance",
        certainty: "suspected",
        reaction: "Reported rash",
        severity: "unknown",
      },
    ],
    ["baseline", { name: "Usual sleep", value: "7", unit: "hours" }],
    ["symptom", { name: "Synthetic discomfort", bodySite: "left arm" }],
    ["activity", { name: "Walking" }],
    ["clinical", { content: "Detailed reviewed observation. ".repeat(45) }],
  ];
  for (const [category, fields] of values) {
    const d = f.input(category, fields),
      r = await f.save(d);
    expect((await f.save(d)).eventId).toBe(r.eventId);
    const event = await readContribution(
      db.pool,
      f.patient.session,
      { kind: "patient" },
      r.eventId!,
    );
    expect(event.category).toBe(category);
    expect(event.author_account_id).toBe(f.doctor.accountId);
    expect(event.source_status).toBe("professional-finalized");
    if (["medication-use", "prescription"].includes(category)) {
      expect(event.body.careDetails.indication).toBe(fields.indication);
      expect(event.body.text).toContain(
        `Reason for medication: ${fields.indication}`,
      );
    }
    if (category === "prescription") {
      expect(event.body.medication).toBeUndefined();
      expect(
        (await healthState(db.pool, f.patient.session)).items,
      ).toHaveLength(0);
    }
    if (category === "medication-use")
      expect(event.body.medication).toMatchObject({
        useStatus: "taking",
        actualStart: "2026-01-03",
      });
    if (category === "ongoing") {
      await expect(
        f.save({ ...d, fields: { ...d.fields, status: "resolved" } }),
      ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
      expect(event.body.text).toContain("Suspected");
      expect(event.body.careDetails.certainty).toBe("suspected");
      expect(event.occurred_at.precision).toBe("range");
    }
    if (category === "clinical")
      expect(event.source_spans.length).toBeGreaterThan(1);
  }
  expect(
    (
      await db.pool.query(
        "select state,use_state from mhistree.medication_recommendations where patient_person_id=$1",
        [f.patient.personId],
      )
    ).rows,
  ).toEqual([{ state: "taking", use_state: "taking" }]);
});
it("rejects missing medication details, unreviewed records, wrong patients and excluded categories before publication", async () => {
  const f = await fixture(["clinical", "medication-use"]);
  for (const value of [
    f.input("medication-use", {
      name: "Synthetic medicine",
      dose: "10 mg",
      useStatus: "taking",
    }),
    { ...f.input("clinical", { content: "Reviewed text" }), reviewed: false },
    f.input("medication-use", {
      name: "para",
      dose: "10 mg",
      frequency: "once daily",
      useStatus: "taking",
    }),
    f.input("medication-use", {
      name: "Synthetic medicine",
      dose: "10 mg",
      frequency: "once daily",
      useStatus: "stopped",
      actualStart: "2026-02-03",
      actualEnd: "2026-02-01",
    }),
  ])
    await expect(f.save(value)).rejects.toThrow();
  await expect(
    f.save({
      ...f.input("clinical", { content: "Wrong patient" }),
      patientPersonId: randomUUID(),
    }),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  await expect(
    f.save(f.input("allergy", { name: "Synthetic substance" })),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  expect(
    (
      await db.pool.query(
        "select count(*) from mhistree.clinical_work where patient_person_id=$1",
        [f.patient.personId],
      )
    ).rows[0].count,
  ).toBe("0");
});
it("rolls back failed publication and denies saving or browsing notes after revocation", async () => {
  const f = await fixture();
  await db.pool.query(
    "create function mhistree.fail_note_test() returns trigger language plpgsql as $$begin raise exception 'injected note state failure';end;$$; create trigger fail_note_test before insert or update on mhistree.persistent_state for each row execute function mhistree.fail_note_test()",
  );
  try {
    await expect(
      f.save(f.input("allergy", { name: "Synthetic substance" })),
    ).rejects.toThrow("injected note state failure");
  } finally {
    await db.pool.query(
      "drop trigger fail_note_test on mhistree.persistent_state;drop function mhistree.fail_note_test()",
    );
  }
  expect(
    (
      await db.pool.query(
        "select count(*) from mhistree.clinical_work where patient_person_id=$1",
        [f.patient.personId],
      )
    ).rows[0].count,
  ).toBe("0");
  await f.save(
    f.input("clinical", { content: "Private before revocation" }, "note"),
  );
  await revokeConnection(db.pool, f.patient.session, f.connection);
  await expect(
    privateNotes(db.pool, f.doctor.session, f.context),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
  await expect(
    f.save(f.input("clinical", { content: "Not authorised" }, "note")),
  ).rejects.toMatchObject({ code: "ACCESS_DENIED" });
});
it("paginates only the author's private notes, independently of patient records", async () => {
  const f = await fixture();
  for (let i = 0; i < 22; i++)
    await f.save(f.input("clinical", { content: `Private note ${i}` }, "note"));
  const first = await privateNotes(db.pool, f.doctor.session, f.context),
    second = await privateNotes(
      db.pool,
      f.doctor.session,
      f.context,
      first.nextCursor!,
    );
  expect(first.items).toHaveLength(20);
  expect(second.items).toHaveLength(2);
  expect(new Set([...first.items, ...second.items].map((n) => n.id)).size).toBe(
    22,
  );
  await expect(
    privateNotes(db.pool, f.doctor.session, f.context, "invalid"),
  ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
});
it("retains authorised no-contact initial-care recording and private notes", async () => {
  const doctor = await staffFixture(db.pool),
    org = randomUUID();
  await db.pool.query(
    "insert into mhistree.organizations(id,status) values($1,'approved')",
    [org],
  );
  await db.pool.query(
    "insert into mhistree.memberships(organization_id,account_id,active,privileges) values($1,$2,true,'{person.register,records.read,records.write}')",
    [org, doctor.accountId],
  );
  await db.pool.query(
    "insert into mhistree.staff_authorities(account_id,context_id,organization_id,privileges,evidence_reference) values($1,$2,$3,'{person.register}','Synthetic registration authority')",
    [doctor.accountId, `organization:${org}`, org],
  );
  const patient = await registerOrganizationPatient(db.pool, doctor.session, {
    organizationId: org,
    person: { displayName: "Synthetic patient without contacts" },
  });
  const context = await establishInitialCare(db.pool, doctor.session, {
    organizationId: org,
    patientPersonId: patient.personId,
    categories: ["clinical"],
    evidence: "Synthetic patient initial care basis confirmed.",
  });
  const d = {
    requestKey: randomUUID(),
    patientPersonId: patient.personId,
    destination: "record",
    category: "clinical",
    fields: careNoteFields.parse({
      content: "Initial reviewed clinical observation",
    }),
    timezone: "Africa/Lagos",
    reviewed: true,
  };
  const record = await saveCareNote(db.pool, doctor.session, context, d);
  expect(record.eventId).toBeTruthy();
  await saveCareNote(db.pool, doctor.session, context, {
    ...d,
    requestKey: randomUUID(),
    destination: "note",
  });
  expect(
    (await privateNotes(db.pool, doctor.session, context)).items,
  ).toHaveLength(1);
});
