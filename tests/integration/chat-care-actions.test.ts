import { beforeAll, afterAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { testDatabase } from "../helpers/postgres";
import { staffFixture } from "../helpers/fixtures";
import {
  createConversation,
  sendMessage,
  generateReply,
  conversationHistory,
} from "@/features/ai-chat/server";
import {
  careProposalOptions,
  changeCareProposal,
} from "@/features/ai-chat/care-actions";
import { practitionerNotifications } from "@/features/practitioner/notifications";
import type { CareProposal } from "@/features/ai-chat/care-action-schema";
let db: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  db = await testDatabase();
});
afterAll(async () => {
  await db?.stop();
});
async function fixture(kind: "message" | "appointment" = "message") {
  const patient = await staffFixture(db.pool),
    doctor = await staffFixture(db.pool);
  const connection = randomUUID();
  await db.pool.query(
    "update mhistree.professionals set privileges='{records.read,messages.send,appointments.manage}' where account_id=$1",
    [doctor.accountId],
  );
  await db.pool.query(
    "insert into mhistree.connections(id,patient_person_id,kind,practitioner_account_id,status) values($1,$2,'direct',$3,'active')",
    [connection, patient.personId, doctor.accountId],
  );
  await db.pool.query(
    "insert into mhistree.consents(connection_id,categories,exclusions,origin_person_ids,origin_context_ids,method,responsible_account_id) values($1,'{symptom}','{}',$2,'{*}','login',$3)",
    [connection, [patient.personId], patient.accountId],
  );
  const conversation = await createConversation(
    db.pool,
    patient.session,
    randomUUID(),
  );
  const sent = await sendMessage(db.pool, patient.session, {
    conversationId: conversation.id,
    requestKey: randomUUID(),
    content:
      kind === "message"
        ? "Help me ask my doctor if taking this medicine would help."
        : "Help me request an appointment with my doctor.",
    timezone: "Africa/Lagos",
  });
  await generateReply(db.pool, patient.session, sent.messageId, {
    generate: async () => {
      throw Error("must use structured reply");
    },
    patientReply: async () => ({
      text: "Please review the details before confirming.",
      action: {
        kind,
        connectionId: connection,
        practitionerId: doctor.accountId,
        draft:
          "Would taking this medicine help? I have not decided to take it.",
      },
    }),
  });
  const history = await conversationHistory(
    db.pool,
    patient.session,
    conversation.id,
  );
  const initial = history.items.at(-1)?.careProposal as CareProposal;
  const proposal = await changeCareProposal(db.pool, patient.session, {
    action: "update",
    id: initial.id,
    version: initial.version,
    payload: {
      ...initial.payload,
      connectionId: connection,
      practitionerId: doctor.accountId,
      connectionRevision: 1,
    },
  });
  // Return revision1 for the test setup while preserving the same explicit reviewed destination.
  await db.pool.query(
    "update mhistree.chat_care_proposals set version=1 where id=$1",
    [proposal.id],
  );
  proposal.version = 1;
  return { patient, doctor, connection, conversation, proposal };
}
it("stores proposals privately without care messages or unread notifications; reviewed confirm is idempotent", async () => {
  const f = await fixture();
  expect(f.proposal.state).toBe("draft");
  expect(f.proposal.payload.content).toContain(
    "Help me ask my doctor if taking this medicine would help.",
  );
  expect(f.proposal.payload.content).toContain("Could you advise");
  expect(
    (await practitionerNotifications(db.pool, f.doctor.session)).connections,
  ).toEqual([]);
  const updated = await changeCareProposal(db.pool, f.patient.session, {
    action: "update",
    id: f.proposal.id,
    version: 1,
    payload: { ...f.proposal.payload, content: "My exact reviewed question." },
  });
  const [first, duplicate] = await Promise.all(
    [1, 2].map(() =>
      changeCareProposal(db.pool, f.patient.session, {
        action: "confirm",
        id: updated.id,
        version: updated.version,
      }),
    ),
  );
  expect(first.result_id).toBe(duplicate.result_id);
  expect(first.state).toBe("completed");
  expect(first).not.toHaveProperty("operation_key");
  const messages = (
    await db.pool.query(
      "select content from mhistree.care_messages where id=$1",
      [first.result_id],
    )
  ).rows;
  expect(messages).toEqual([{ content: "My exact reviewed question." }]);
  expect(
    (await practitionerNotifications(db.pool, f.doctor.session)).connections,
  ).toEqual([{ connectionId: f.connection, unread: 1 }]);
  const restored = await conversationHistory(
    db.pool,
    f.patient.session,
    f.conversation.id,
  );
  expect(restored.items.at(-1)?.content).toBe(
    "Please review the details before confirming.",
  );
  expect(restored.items.at(-1)?.careProposal.state).toBe("completed");
});
it("denies another account, stale edits, revoked recipients and retains the private draft", async () => {
  const f = await fixture(),
    other = await staffFixture(db.pool);
  await expect(
    careProposalOptions(db.pool, other.session, f.proposal.id),
  ).rejects.toThrow("ACCESS_DENIED");
  await expect(
    changeCareProposal(db.pool, other.session, {
      action: "confirm",
      id: f.proposal.id,
      version: 1,
    }),
  ).rejects.toThrow("ACCESS_DENIED");
  const updated = await changeCareProposal(db.pool, f.patient.session, {
    action: "update",
    id: f.proposal.id,
    version: 1,
    payload: { ...f.proposal.payload, content: "Retain this draft." },
  });
  await expect(
    changeCareProposal(db.pool, f.patient.session, {
      action: "update",
      id: f.proposal.id,
      version: 1,
      payload: f.proposal.payload,
    }),
  ).rejects.toThrow("VERSION_CONFLICT");
  await db.pool.query(
    "update mhistree.connections set status='revoked',revision=revision+1 where id=$1",
    [f.connection],
  );
  const privateEdit = await changeCareProposal(db.pool, f.patient.session, {
    action: "update",
    id: f.proposal.id,
    version: updated.version,
    payload: {
      ...updated.payload,
      content: "Private changes after revocation.",
    },
  });
  const failed = await changeCareProposal(db.pool, f.patient.session, {
    action: "confirm",
    id: f.proposal.id,
    version: privateEdit.version,
  });
  expect(failed.state).toBe("failed");
  expect(failed.deliveries?.[0].errorCode).toBe("ACCESS_REVOKED");
  const restored = await careProposalOptions(
    db.pool,
    f.patient.session,
    f.proposal.id,
  );
  expect(restored.options.recipients).toEqual([]);
  expect(restored.proposal.payload.content).toBe(
    "Private changes after revocation.",
  );
  expect(restored.proposal.result_id).toBeNull();
});
it("rolls back a care-message write if recording the proposal result fails", async () => {
  const f = await fixture();
  await db.pool.query(
    `create function mhistree.synthetic_proposal_failure() returns trigger language plpgsql as $$ begin if new.proposal_id='${f.proposal.id}'::uuid and new.state='stored' then raise exception 'synthetic failure'; end if; return new; end $$; create trigger synthetic_proposal_failure before update on mhistree.chat_care_deliveries for each row execute function mhistree.synthetic_proposal_failure()`,
  );
  try {
    const result = await changeCareProposal(db.pool, f.patient.session, {
      action: "confirm",
      id: f.proposal.id,
      version: 1,
    });
    expect(result.state).toBe("failed");
    const count = (
      await db.pool.query(
        "select count(*)::int n from mhistree.care_messages m join mhistree.care_threads t on t.id=m.thread_id where t.connection_id=$1",
        [f.connection],
      )
    ).rows[0].n;
    expect(count).toBe(0);
    expect(
      (await careProposalOptions(db.pool, f.patient.session, f.proposal.id))
        .proposal.state,
    ).toBe("failed");
  } finally {
    await db.pool.query(
      "drop trigger synthetic_proposal_failure on mhistree.chat_care_deliveries; drop function mhistree.synthetic_proposal_failure()",
    );
  }
});
it("dismisses without sending and rejects guessed recipients", async () => {
  const f = await fixture();
  await expect(
    changeCareProposal(db.pool, f.patient.session, {
      action: "update",
      id: f.proposal.id,
      version: 1,
      payload: { ...f.proposal.payload, practitionerId: randomUUID() },
    }),
  ).rejects.toThrow("ACCESS_REVOKED");
  const result = await changeCareProposal(db.pool, f.patient.session, {
    action: "dismiss",
    id: f.proposal.id,
    version: 1,
  });
  expect(result.state).toBe("dismissed");
  await expect(
    changeCareProposal(db.pool, f.patient.session, {
      action: "confirm",
      id: f.proposal.id,
      version: result.version,
    }),
  ).rejects.toThrow("VERSION_CONFLICT");
});
it("requests an advertised appointment once, never accepts it, and checks distinct appointment privilege", async () => {
  const f = await fixture("appointment");
  const starts = new Date(Date.now() + 86400000);
  starts.setUTCSeconds(0, 0);
  await db.pool.query(
    "insert into mhistree.availability_slots(account_id,starts_at,ends_at,timezone) values($1,$2,$3,'Africa/Lagos')",
    [f.doctor.accountId, starts, new Date(starts.getTime() + 3600000)],
  );
  const options = await careProposalOptions(
    db.pool,
    f.patient.session,
    f.proposal.id,
  );
  const chosen = options.options.slots[0];
  expect(chosen).toBeDefined();
  const updated = await changeCareProposal(db.pool, f.patient.session, {
    action: "update",
    id: f.proposal.id,
    version: 1,
    payload: {
      ...f.proposal.payload,
      slot: {
        startsAt: chosen.startsAt,
        endsAt: chosen.endsAt,
        timezone: chosen.timezone,
      },
    },
  });
  const result = await changeCareProposal(db.pool, f.patient.session, {
    action: "confirm",
    id: f.proposal.id,
    version: updated.version,
  });
  expect(
    (
      await db.pool.query(
        "select state from mhistree.appointments where id=$1",
        [result.result_id],
      )
    ).rows[0].state,
  ).toBe("requested");
  expect(
    (
      await changeCareProposal(db.pool, f.patient.session, {
        action: "confirm",
        id: f.proposal.id,
        version: updated.version,
      })
    ).result_id,
  ).toBe(result.result_id);
  await db.pool.query(
    "update mhistree.professionals set privileges='{records.read,messages.send}' where account_id=$1",
    [f.doctor.accountId],
  );
  expect(
    (await careProposalOptions(db.pool, f.patient.session, f.proposal.id))
      .options.recipients,
  ).toEqual([]);
});
it("rejects unavailable/guessed appointment times without losing the proposal", async () => {
  const f = await fixture("appointment");
  const payload = {
    ...f.proposal.payload,
    slot: {
      startsAt: new Date(Date.now() + 86400000).toISOString(),
      endsAt: new Date(Date.now() + 88200000).toISOString(),
      timezone: "Africa/Lagos",
    },
  };
  const updated = await changeCareProposal(db.pool, f.patient.session, {
    action: "update",
    id: f.proposal.id,
    version: 1,
    payload,
  });
  await expect(
    changeCareProposal(db.pool, f.patient.session, {
      action: "confirm",
      id: f.proposal.id,
      version: updated.version,
    }),
  ).rejects.toThrow("VERSION_CONFLICT");
  expect(
    (await careProposalOptions(db.pool, f.patient.session, f.proposal.id))
      .proposal.state,
  ).toBe("draft");
});

it("keeps an ambiguous or fabricated recipient unselected instead of sending to an arbitrary connection", async () => {
  const f = await fixture();
  const sent = await sendMessage(db.pool, f.patient.session, {
    conversationId: f.conversation.id,
    requestKey: randomUUID(),
    content: "Help me contact Mr Unknown.",
    timezone: "Africa/Lagos",
  });
  await generateReply(db.pool, f.patient.session, sent.messageId, {
    generate: async () => "unused",
    patientReply: async () => ({
      text: "Which connected recipient do you mean?",
      action: {
        kind: "message",
        connectionId: randomUUID(),
        practitionerId: randomUUID(),
        draft: "Can we discuss my question?",
      },
    }),
  });
  const history = await conversationHistory(
    db.pool,
    f.patient.session,
    f.conversation.id,
  );
  const proposal = history.items.at(-1)?.careProposal as CareProposal;
  expect(proposal.payload.connectionId).toBeNull();
  expect(proposal.payload.practitionerId).toBeNull();
  await expect(
    changeCareProposal(db.pool, f.patient.session, {
      action: "confirm",
      id: proposal.id,
      version: 1,
    }),
  ).rejects.toThrow("ACCESS_DENIED");
});
it("a narrowed-and-restored connection requires explicit recipient review at its new revision", async () => {
  const f = await fixture();
  await db.pool.query(
    "update mhistree.connections set revision=revision+1 where id=$1",
    [f.connection],
  );
  const failed = await changeCareProposal(db.pool, f.patient.session, {
    action: "confirm",
    id: f.proposal.id,
    version: 1,
  });
  expect(failed.state).toBe("failed");
  expect(failed.deliveries?.[0].errorCode).toBe("ACCESS_REVOKED");
  const options = await careProposalOptions(
    db.pool,
    f.patient.session,
    f.proposal.id,
  );
  const selected = options.options.recipients[0];
  const reviewed = await changeCareProposal(db.pool, f.patient.session, {
    action: "update",
    id: f.proposal.id,
    version: failed.version,
    payload: {
      ...f.proposal.payload,
      connectionRevision: selected.revision,
      recipients: [
        {
          connectionId: selected.connectionId,
          practitionerId: selected.practitionerId,
          connectionRevision: selected.revision,
        },
      ],
    },
  });
  expect(
    (
      await changeCareProposal(db.pool, f.patient.session, {
        action: "confirm",
        id: reviewed.id,
        version: reviewed.version,
      })
    ).state,
  ).toBe("completed");
});
