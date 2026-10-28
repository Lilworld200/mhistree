import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import { getConnectedPractitioners } from "@/features/access/patient-controls";
import { practitionerDiscovery } from "@/features/ai-chat/practitioner-discovery";
import {
  createConversation,
  sendMessage,
  generateReply,
  conversationHistory,
} from "@/features/ai-chat/server";
import { failure } from "@/lib/http";

vi.mock("@/features/access/patient-controls", async (original) => {
  const actual =
    await original<typeof import("@/features/access/patient-controls")>();
  return {
    ...actual,
    getConnectedPractitioners: vi.fn(actual.getConnectedPractitioners),
  };
});
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  db = await testDatabase();
});
afterAll(async () => {
  await db?.stop();
});
async function direct() {
  const patient = await staffFixture(db.pool),
    doctor = await staffFixture(db.pool);
  const connection = randomUUID();
  await db.pool.query(
    "update mhistree.professionals set privileges='{records.read,messages.send}' where account_id=$1",
    [doctor.accountId],
  );
  await db.pool.query(
    "insert into mhistree.connections(id,patient_person_id,kind,practitioner_account_id,status) values($1,$2,'direct',$3,'active')",
    [connection, patient.personId, doctor.accountId],
  );
  await db.pool.query(
    "insert into mhistree.consents(connection_id,categories,exclusions,origin_person_ids,origin_context_ids,method,responsible_account_id) values($1,'{symptom,allergy}','{allergy}',$2,'{*}','login',$3)",
    [connection, [patient.personId], patient.accountId],
  );
  return { patient, doctor, connection };
}
async function sent(session: string) {
  const conversation = await createConversation(db.pool, session, randomUUID());
  const message = await sendMessage(db.pool, session, {
    conversationId: conversation.id,
    requestKey: randomUUID(),
    content: "Help me contact my practitioner about my concern",
    timezone: "Africa/Lagos",
  });
  return { ...message, conversation: conversation.id };
}
it("discovers only own eligible recipient and projects consent exclusions without granting identity-table access", async () => {
  const { patient, doctor, connection } = await direct(),
    other = await staffFixture(db.pool);
  const result = await getConnectedPractitioners(db.pool, patient.session);
  expect(result.status).toBe("available");
  expect(result.connectedPractitioners).toEqual([
    expect.objectContaining({
      connectionId: connection,
      practitionerId: doctor.accountId,
      canMessage: true,
      categories: ["symptom"],
    }),
  ]);
  expect(
    (await getConnectedPractitioners(db.pool, other.session))
      .connectedPractitioners,
  ).toEqual([]);
  expect(
    (
      await db.pool.query(
        "select has_table_privilege('mhistree_runtime','mhistree.accounts','SELECT') allowed",
      )
    ).rows[0].allowed,
  ).toBe(false);
  await db.pool.query(
    "update mhistree.professionals set privileges='{records.read}' where account_id=$1",
    [doctor.accountId],
  );
  expect(
    (await getConnectedPractitioners(db.pool, patient.session))
      .connectedPractitioners,
  ).toEqual([]);
  await db.pool.query(
    "update mhistree.professionals set privileges='{records.read,messages.send}',status='suspended' where account_id=$1",
    [doctor.accountId],
  );
  expect(
    (await getConnectedPractitioners(db.pool, patient.session))
      .connectedPractitioners,
  ).toEqual([]);
});
it("empty or excluded consent and inactive recipient accounts cannot be offered", async () => {
  const { patient, doctor, connection } = await direct();
  await db.pool.query(
    "update mhistree.accounts set status='retired' where id=$1",
    [doctor.accountId],
  );
  expect(
    (await getConnectedPractitioners(db.pool, patient.session))
      .connectedPractitioners,
  ).toEqual([]);
  await db.pool.query(
    "update mhistree.accounts set status='active' where id=$1",
    [doctor.accountId],
  );
  await db.pool.query(
    "insert into mhistree.consents(connection_id,categories,exclusions,origin_person_ids,origin_context_ids,method,responsible_account_id) values($1,'{symptom}','{symptom}',$2,'{*}','login',$3)",
    [connection, [patient.personId], patient.accountId],
  );
  expect(
    (await getConnectedPractitioners(db.pool, patient.session))
      .connectedPractitioners,
  ).toEqual([]);
});

it("organization discovery requires current assignment, membership privileges and approved organization", async () => {
  const { patient, doctor } = await direct(),
    organization = randomUUID(),
    connection = randomUUID(),
    assignment = randomUUID();
  await db.pool.query(
    "insert into mhistree.organizations(id,status) values($1,'approved')",
    [organization],
  );
  await db.pool.query(
    "insert into mhistree.memberships(organization_id,account_id,active,privileges) values($1,$2,true,'{records.read,messages.send}')",
    [organization, doctor.accountId],
  );
  await db.pool.query(
    "insert into mhistree.assignments(id,organization_id,patient_person_id,account_id,active,categories) values($1,$2,$3,$4,true,'{symptom}')",
    [assignment, organization, patient.personId, doctor.accountId],
  );
  await db.pool.query(
    "insert into mhistree.connections(id,patient_person_id,kind,organization_id,status) values($1,$2,'organization',$3,'active')",
    [connection, patient.personId, organization],
  );
  await db.pool.query(
    "insert into mhistree.consents(connection_id,categories,origin_person_ids,origin_context_ids,method,responsible_account_id) values($1,'{symptom}',$2,'{*}','login',$3)",
    [connection, [patient.personId], patient.accountId],
  );
  const recipients = async () =>
    (
      await getConnectedPractitioners(db.pool, patient.session)
    ).connectedPractitioners.filter((p) => p.connectionId === connection);
  expect(await recipients()).toEqual([
    expect.objectContaining({
      assignmentId: assignment,
      kind: "organization",
      categories: ["symptom"],
    }),
  ]);
  await db.pool.query(
    "update mhistree.assignments set active=false where id=$1",
    [assignment],
  );
  expect(await recipients()).toEqual([]);
  await db.pool.query(
    "update mhistree.assignments set active=true where id=$1",
    [assignment],
  );
  await db.pool.query(
    "update mhistree.memberships set privileges='{records.read}' where organization_id=$1",
    [organization],
  );
  expect(await recipients()).toEqual([]);
  await db.pool.query(
    "update mhistree.memberships set privileges='{records.read,messages.send}' where organization_id=$1",
    [organization],
  );
  await db.pool.query(
    "update mhistree.organizations set status='suspended' where id=$1",
    [organization],
  );
  expect(await recipients()).toEqual([]);
});
it("discovery failure allows an ordinary reply and cannot become a false empty recipient list", async () => {
  const { patient } = await direct(),
    message = await sent(patient.session);
  vi.mocked(getConnectedPractitioners).mockRejectedValueOnce(
    Object.assign(new Error("private SQL must not leak"), { code: "42501" }),
  );
  const generate = vi.fn(async (system: string) => {
    expect(system).toContain('"status":"unavailable"');
    expect(system).not.toContain('"connectedPractitioners":[]');
    expect(system).not.toContain("private SQL must not leak");
    return "I couldn't check practitioner availability. We can still discuss your concern.";
  });
  expect(
    await generateReply(db.pool, patient.session, message.messageId, {
      generate,
    }),
  ).toEqual({ state: "succeeded" });
  expect(generate).toHaveBeenCalledTimes(1);
  expect(
    (
      await conversationHistory(db.pool, patient.session, message.conversation)
    ).items.at(-1)?.role,
  ).toBe("assistant");
  expect(
    (await db.pool.query("select count(*)::int n from mhistree.care_messages"))
      .rows[0].n,
  ).toBe(0);
});
it("withholds a generated reply when recipient access is revoked during generation", async () => {
  const { patient, connection } = await direct(),
    message = await sent(patient.session);
  await expect(
    generateReply(db.pool, patient.session, message.messageId, {
      generate: async (system) => {
        expect(system).toContain(connection);
        await db.pool.query(
          "update mhistree.connections set status='revoked',revision=revision+1 where id=$1",
          [connection],
        );
        return "You can contact your connected practitioner.";
      },
    }),
  ).rejects.toThrow("ACCESS_REVOKED");
  expect(
    (
      await conversationHistory(db.pool, patient.session, message.conversation)
    ).items.some((m) => m.role === "assistant"),
  ).toBe(false);
});
it("invalid and retired sessions are never downgraded to optional discovery failures", async () => {
  await expect(practitionerDiscovery(db.pool, "invalid")).rejects.toThrow(
    "AUTH_REQUIRED",
  );
  const { patient } = await direct();
  await db.pool.query(
    "update mhistree.accounts set session_epoch=session_epoch+1 where id=$1",
    [patient.accountId],
  );
  await expect(practitionerDiscovery(db.pool, patient.session)).rejects.toThrow(
    "SESSION_RETIRED",
  );
});
it("database permissions return a sanitized database error, not a provider outage", async () => {
  const log = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    const response = failure(
      Object.assign(new Error("sensitive SQL or credentials"), {
        code: "42501",
      }),
    );
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.error.code).toBe("DATABASE_PERMISSION_DENIED");
    expect(JSON.stringify([body, log.mock.calls])).not.toContain(
      "sensitive SQL",
    );
    expect(log).toHaveBeenCalled();
  } finally {
    log.mockRestore();
  }
});
