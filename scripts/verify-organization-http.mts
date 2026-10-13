import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Pool } from "pg";
const origin = "http://127.0.0.1:3101";
const config = JSON.parse(await readFile(".local/app-database.json", "utf8"));
assert.equal(config.host, "127.0.0.1", "Synthetic bootstrap must remain local");
const pool = new Pool(config);
function client() {
  const cookies = new Map<string, string>();
  return {
    async raw(path: string, body?: unknown) {
      const r = await fetch(origin + path, {
        method: body === undefined ? "GET" : "POST",
        redirect: "manual",
        headers: {
          Origin: origin,
          "Content-Type": "application/json",
          Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      for (const value of r.headers.getSetCookie()) {
        const pair = value.split(";", 1)[0],
          i = pair.indexOf("=");
        cookies.set(pair.slice(0, i), pair.slice(i + 1));
      }
      return r;
    },
    async api(path: string, body?: unknown) {
      const r = await this.raw(path, body),
        result = await r.json();
      assert.equal(
        result.ok,
        true,
        `${path}: HTTP ${r.status} ${result.error?.code ?? "bad envelope"}`,
      );
      return result.data;
    },
  };
}
async function account(label: string) {
  const c = client(),
    password = randomBytes(24).toString("base64url");
  await c.api("/api/auth/signup", {
    displayName: `Synthetic organization journey ${label} ${randomUUID()}`,
    requestKey: randomBytes(32).toString("base64url"),
  });
  const setup = await c.api("/api/auth/setup", { password });
  await c.api("/api/auth/login", {
    identifier: setup.loginIdentifier,
    password,
  });
  const identity = (
    await pool.query(
      "select id,person_id from mhistree.accounts where login_identifier=$1",
      [setup.loginIdentifier],
    )
  ).rows[0];
  return { ...c, ...identity };
}
try {
  const admin = await account("administrator"),
    doctor = await account("clinician"),
    reviewer = await account("reviewer");
  // Only reviewer authority is bootstrapped; qualification/org approvals use their real transports.
  for (const [context, privilege] of [
    ["review:professionals", "professional.review"],
    ["review:organizations", "organization.review"],
    ["review:identity", "identity.review"],
  ])
    await pool.query(
      "insert into mhistree.staff_authorities(account_id,context_id,privileges,evidence_reference) values($1,$2,$3,'Local synthetic reviewer only')",
      [reviewer.id, context, [privilege]],
    );
  const application = await doctor.api("/api/practitioner", {
    legalName: "Synthetic doctor",
    profession: "Test physician",
    registrationNumber: "SYNTHETIC-ONLY",
    jurisdiction: "Test registry",
    filename: "synthetic.pdf",
    base64: Buffer.from("%PDF-1.4\nSynthetic credential only\n%%EOF").toString(
      "base64",
    ),
    requestKey: randomUUID(),
  });
  await reviewer.api("/api/review", {
    applicationId: application.id,
    version: 1,
    decision: "approved",
    authorityUrl: "https://example.org/synthetic",
    evidence: "Synthetic credential evidence, not real medical qualification",
    privileges: [
      "records.read",
      "records.write",
      "person.register",
      "person.lookup",
      "auth.activate",
    ],
  });
  const org = await admin.api("/api/organizations", {
    legalName: "Synthetic HTTP organization",
    registrationNumber: "SYNTHETIC-ONLY",
    jurisdiction: "Test registry",
    address: "Synthetic local test address",
    administratorCapacity: "Synthetic authorized organizational applicant",
    requestKey: randomUUID(),
  });
  assert.equal(
    (await admin.raw(`/api/organizations/staff?organization=${org.id}`)).status,
    403,
  );
  await reviewer.api("/api/review/organizations", {
    organizationId: org.id,
    version: 1,
    decision: "approved",
    evidence: "Synthetic organization independent registry review",
    administratorEvidence:
      "Synthetic administrator independent identity and authority review",
  });
  const privileges = [
    "person.register",
    "person.lookup",
    "auth.activate",
    "consent.manage",
    "assignments.manage",
    "records.read",
    "records.write",
  ];
  const invite = await admin.api("/api/organizations/staff", {
    action: "invite",
    data: { organizationId: org.id, accountId: doctor.id, privileges },
  });
  assert.equal(
    (
      await admin.raw("/api/organizations/staff", {
        action: "respond",
        data: { id: invite.id, accept: true },
      })
    ).status,
    403,
  );
  await doctor.api("/api/organizations/staff", {
    action: "respond",
    data: { id: invite.id, accept: true },
  });
  console.log(
    "PASS pending organization denied, independent approval, targeted invitation and separate staff privileges",
  );
  const patient = await doctor.api("/api/organizations/patients", {
    action: "register",
    data: {
      organizationId: org.id,
      person: { displayName: "Synthetic contactless organizational patient" },
    },
  });
  const basis = await doctor.api("/api/organizations/patients", {
    action: "initial-care",
    data: {
      organizationId: org.id,
      patientPersonId: patient.personId,
      categories: ["clinical"],
      evidence: "Synthetic explicit registration care basis and identity check",
    },
  });
  const context = { kind: "initial-care", ...basis };
  const work = await doctor.api("/api/organizations/workspace", {
    context,
    action: "save",
    data: {
      requestKey: randomUUID(),
      patientPersonId: patient.personId,
      kind: "draft",
      category: "clinical",
      body: {
        text: "Synthetic initial care finding",
        bodySite: null,
        contextLinks: [],
      },
      occurredAt: { precision: "unknown" },
      timezone: "Africa/Lagos",
    },
  });
  await doctor.api("/api/organizations/workspace", {
    context,
    action: "finalize",
    data: {
      id: work.id,
      version: 1,
      requestKey: randomUUID(),
      reviewed: true,
      status: "unknown",
    },
  });
  const assistance = {
    organizationId: org.id,
    personId: patient.personId,
    purpose: "activation",
    verificationMethod: "In-person identity check",
    evidenceReference: "Synthetic restricted identity evidence for activation",
  };
  const credential = await doctor.api("/api/organizations/assistance", {
    action: "issue",
    data: assistance,
  });
  const patientClient = client();
  await patientClient.api("/api/auth/redeem", { code: credential.code });
  const password = randomBytes(24).toString("base64url"),
    setup = await patientClient.api("/api/auth/setup", { password });
  await patientClient.api("/api/auth/login", {
    identifier: setup.loginIdentifier,
    password,
  });
  assert.ok(
    (await patientClient.api("/api/records")).items.some(
      (e: { source_status: string }) =>
        e.source_status === "professional-finalized",
    ),
  );
  assert.equal(
    (
      await doctor.raw(
        `/api/organizations/workspace?context=${encodeURIComponent(JSON.stringify(context))}`,
      )
    ).status,
    403,
  );
  console.log(
    "PASS no-contact registration, initial-care finalization, patient activation and visible attributed history",
  );
  const connection = await doctor.api("/api/organizations/staff", {
    action: "connect",
    data: {
      organizationId: org.id,
      patientPersonId: patient.personId,
      requestKey: randomUUID(),
      method: "login",
      categories: ["clinical"],
      exclusions: [],
    },
  });
  await patientClient.api("/api/connections", {
    action: "consent",
    data: {
      connectionId: connection.id,
      version: 1,
      mode: "approve",
      categories: ["clinical"],
      exclusions: [],
    },
  });
  const assignment = await doctor.api("/api/organizations/staff", {
    action: "assign",
    data: {
      organizationId: org.id,
      connectionId: connection.id,
      accountId: doctor.id,
      categories: ["clinical"],
    },
  });
  const careContext = {
    kind: "organization",
    organizationId: org.id,
    connectionId: connection.id,
    assignmentId: assignment.id,
  };
  await doctor.api(
    `/api/organizations/workspace?context=${encodeURIComponent(JSON.stringify(careContext))}`,
  );
  assert.equal(
    (
      await admin.raw(
        `/api/organizations/workspace?context=${encodeURIComponent(JSON.stringify(careContext))}`,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await doctor.raw("/api/organizations/assistance", {
        action: "issue",
        data: { ...assistance, purpose: "recovery" },
      })
    ).status,
    403,
  );
  await reviewer.api("/api/review/identity", {
    action: "designate",
    data: {
      organizationId: org.id,
      accountId: doctor.id,
      active: true,
      evidence: "Synthetic independent designation of recovery authority",
    },
  });
  const recovery = await doctor.api("/api/organizations/assistance", {
    action: "issue",
    data: { ...assistance, purpose: "recovery" },
  });
  assert.equal((await patientClient.raw("/api/records")).status, 401);
  await patientClient.api("/api/auth/redeem", { code: recovery.code });
  const newPassword = randomBytes(24).toString("base64url"),
    renewed = await patientClient.api("/api/auth/setup", {
      password: newPassword,
    });
  await patientClient.api("/api/auth/login", {
    identifier: renewed.loginIdentifier,
    password: newPassword,
  });
  console.log(
    "PASS patient-approved organization assignment, administration denial, designated recovery and old session retirement",
  );
  const duplicate = await doctor.api("/api/organizations/patients", {
    action: "register",
    data: {
      organizationId: org.id,
      person: { displayName: "Synthetic duplicate provisional identity" },
    },
  });
  const flag = await patientClient.api("/api/identity/duplicates", {
    personId: patient.personId,
    candidateId: duplicate.personId,
    reason: "Synthetic verified duplicate for merge acceptance",
  });
  const preview = await reviewer.api(`/api/review/duplicates?id=${flag.id}`);
  assert.equal(preview.survivorId, patient.personId);
  await reviewer.api("/api/review/duplicates", {
    id: flag.id,
    version: 1,
    decision: "approved",
    identityEvidence:
      "Synthetic independent identity and ownership verification",
    ownershipVerified: true,
    expectedSurvivorId: patient.personId,
  });
  const operationId = randomUUID(),
    merge = {
      action: "merge",
      data: {
        caseId: flag.id,
        version: 2,
        expectedSurvivorId: patient.personId,
        operationId,
      },
    };
  await reviewer.api("/api/review/merges", merge);
  assert.equal(
    (await reviewer.api("/api/review/merges", merge)).replayed,
    true,
  );
  const reversal = await reviewer.api(
    `/api/review/merges?operation=${operationId}`,
  );
  await reviewer.api("/api/review/merges", {
    action: "reverse",
    data: {
      mergeOperationId: operationId,
      operationId: randomUUID(),
      reviewToken: reversal.reviewToken,
      evidence: "Synthetic explicit review of retained origins and later work",
      reviewedLaterWork: true,
    },
  });
  await patientClient.api("/api/connections", {
    action: "revoke",
    data: { id: connection.id },
  });
  assert.equal(
    (
      await doctor.raw(
        `/api/organizations/workspace?context=${encodeURIComponent(JSON.stringify(careContext))}`,
      )
    ).status,
    403,
  );
  console.log(
    "PASS duplicate review, survivor preview, merge replay, controlled reversal and organization revocation",
  );
} finally {
  await pool.end();
}
