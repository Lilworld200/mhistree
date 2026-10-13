"use client";
import { useCallback, useEffect, useState } from "react";
import { Btn } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/client-api";
const grants = [
  "organization.manage",
  "person.lookup",
  "person.register",
  "auth.activate",
  "consent.manage",
  "assignments.manage",
  "records.read",
  "records.write",
  "appointments.manage",
  "messages.send",
  "requests.read",
  "requests.create",
  "results.finalize",
];
const categories = [
  "clinical",
  "allergy",
  "medication-use",
  "baseline",
  "ongoing",
  "symptom",
  "activity",
  "document",
  "prescription",
  "result",
];
const presets: Record<string, string[]> = {
  Custom: [],
  Administration: ["organization.manage"],
  Registration: ["person.lookup", "person.register", "auth.activate"],
  "Clinical care": [
    "records.read",
    "records.write",
    "appointments.manage",
    "messages.send",
    "requests.read",
    "requests.create",
  ],
  "Service results": [
    "records.read",
    "records.write",
    "requests.read",
    "results.finalize",
  ],
};
type Member = {
  account_id: string;
  display_name: string;
  active: boolean;
  privileges: string[];
  version: number;
  qualification: string | null;
};
type Invitation = { id: string; display_name: string; privileges: string[] };
type Patient = {
  assignment_id: string;
  organization_id: string;
  organization_name: string;
  connection_id: string;
  basis_id?: string;
  patient_person_id: string;
  display_name: string;
  categories: string[];
};
export function StaffView({ organizationId }: { organizationId?: string }) {
  const [members, setMembers] = useState<Member[]>([]),
    [privileges, setPrivileges] = useState<string[]>([]),
    [invites, setInvites] = useState<Invitation[]>([]),
    [patients, setPatients] = useState<Patient[]>([]),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [invitationGrants, setInvitationGrants] = useState<string[]>([]);
  const refresh = useCallback(async () => {
    try {
      const data = await api<{
        privileges?: string[];
        members?: Member[];
        invitations: Invitation[];
        patients?: Patient[];
      }>(
        `/api/organizations/staff${organizationId ? `?organization=${organizationId}` : ""}`,
      );
      setMembers(data.members ?? []);
      setPrivileges(data.privileges ?? []);
      setInvites(data.invitations);
      setPatients(data.patients ?? []);
    } catch (e) {
      setMembers([]);
      setPrivileges([]);
      setInvites([]);
      setPatients([]);
      setMessage(errorMessage(e));
    }
  }, [organizationId]);
  useEffect(() => {
    let active = true;
    api<{
      privileges?: string[];
      members?: Member[];
      invitations: Invitation[];
      patients?: Patient[];
    }>(
      `/api/organizations/staff${organizationId ? `?organization=${organizationId}` : ""}`,
    )
      .then((data) => {
        if (active) {
          setMembers(data.members ?? []);
          setPrivileges(data.privileges ?? []);
          setInvites(data.invitations);
          setPatients(data.patients ?? []);
        }
      })
      .catch((e) => {
        if (active) setMessage(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [organizationId]);
  async function act(action: string, data: unknown) {
    setBusy(true);
    setMessage("");
    try {
      const result = await api<{ id?: string }>("/api/organizations/staff", {
        action,
        data,
      });
      await refresh();
      setMessage(result?.id ? `Saved. Reference: ${result.id}` : "Saved.");
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="patient-page">
      <h1>
        {organizationId
          ? "Organization staff"
          : "Organization invitations and assigned patients"}
      </h1>
      <p role="status">{message}</p>
      {!organizationId && (
        <>
          {invites.map((i) => (
            <article key={i.id}>
              <h2>{i.display_name}</h2>
              <p>{i.privileges.join(", ")}</p>
              <Btn
                disabled={busy}
                onClick={() => void act("respond", { id: i.id, accept: true })}
              >
                Accept
              </Btn>
              <Btn
                disabled={busy}
                onClick={() => void act("respond", { id: i.id, accept: false })}
              >
                Decline
              </Btn>
            </article>
          ))}
          {patients.map((p) => (
            <article key={p.assignment_id}>
              <h2>{p.display_name}</h2>
              <p>
                {p.organization_name} · {p.categories.join(", ")}
              </p>
              <a
                href={`/organizations/record?${p.basis_id ? `basis=${p.basis_id}` : `connection=${p.connection_id}`}&organization=${p.organization_id}&assignment=${p.assignment_id}`}
              >
                Open in this organization context
              </a>
            </article>
          ))}
          {!patients.length && <p>No currently assigned patients.</p>}
        </>
      )}
      {organizationId && (
        <>
          {privileges.includes("organization.manage") && (
            <>
              <form
                className="account-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void act("invite", {
                    organizationId,
                    accountId: f.get("accountId"),
                    privileges: f.getAll("privileges"),
                  });
                }}
              >
                <h2>Invite staff</h2>
                <label>
                  Privilege starting point
                  <select
                    defaultValue="Custom"
                    onChange={(e) =>
                      setInvitationGrants(presets[e.target.value])
                    }
                  >
                    {Object.keys(presets).map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Account identifier
                  <input name="accountId" required />
                </label>
                <fieldset>
                  <legend>Effective privileges</legend>
                  {grants.map((p) => (
                    <label key={p}>
                      <input
                        type="checkbox"
                        name="privileges"
                        value={p}
                        checked={invitationGrants.includes(p)}
                        onChange={(e) =>
                          setInvitationGrants((current) =>
                            e.target.checked
                              ? [...current, p]
                              : current.filter((item) => item !== p),
                          )
                        }
                      />
                      {p}
                    </label>
                  ))}
                </fieldset>
                <Btn type="submit" disabled={busy}>
                  Send invitation
                </Btn>
              </form>
              {members.map((m) => (
                <form
                  className="account-form"
                  key={m.account_id}
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void act("membership", {
                      organizationId,
                      accountId: m.account_id,
                      version: m.version,
                      active: f.has("active"),
                      privileges: f.getAll("privileges"),
                    });
                  }}
                >
                  <h2>{m.display_name}</h2>
                  <p>
                    {m.account_id} · Qualification:{" "}
                    {m.qualification ?? "Not reviewed"}
                  </p>
                  <label>
                    <input
                      name="active"
                      type="checkbox"
                      defaultChecked={m.active}
                    />
                    Active membership
                  </label>
                  <fieldset>
                    <legend>Privileges</legend>
                    {grants.map((p) => (
                      <label key={p}>
                        <input
                          type="checkbox"
                          name="privileges"
                          value={p}
                          defaultChecked={m.privileges.includes(p)}
                        />
                        {p}
                      </label>
                    ))}
                  </fieldset>
                  <Btn type="submit" disabled={busy}>
                    Update membership
                  </Btn>
                </form>
              ))}
            </>
          )}
          {privileges.includes("consent.manage") && (
            <form
              className="account-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void act("connect", {
                  organizationId,
                  patientPersonId: f.get("patient"),
                  requestKey: crypto.randomUUID(),
                  method: f.get("method"),
                  categories: f.getAll("categories"),
                  exclusions: f.getAll("exclusions"),
                  ...(f.get("evidence") ? { evidence: f.get("evidence") } : {}),
                });
              }}
            >
              <h2>Patient consent</h2>
              <label>
                Patient identifier
                <input name="patient" required />
              </label>
              <label>
                Method
                <select name="method">
                  <option value="login">Patient login approval</option>
                  <option value="in-person">Recorded in-person consent</option>
                </select>
              </label>
              <fieldset>
                <legend>Requested categories</legend>
                {categories.map((c) => (
                  <label key={c}>
                    <input name="categories" value={c} type="checkbox" />
                    {c}
                  </label>
                ))}
              </fieldset>
              <fieldset>
                <legend>Exclusions</legend>
                {categories.map((c) => (
                  <label key={c}>
                    <input name="exclusions" value={c} type="checkbox" />
                    {c}
                  </label>
                ))}
              </fieldset>
              <label>
                In-person identity and consent evidence
                <textarea name="evidence" minLength={20} maxLength={2000} />
              </label>
              <Btn type="submit" disabled={busy}>
                Record consent request
              </Btn>
            </form>
          )}
          {privileges.includes("assignments.manage") && (
            <form
              className="account-form"
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void act("assign", {
                  organizationId,
                  connectionId: f.get("connection"),
                  accountId: f.get("account"),
                  categories: f.getAll("categories"),
                });
              }}
            >
              <h2>Assign patient</h2>
              <label>
                Connection identifier
                <input name="connection" required />
              </label>
              <label>
                Practitioner account
                <select name="account" required>
                  <option value="">Select practitioner</option>
                  {members
                    .filter((m) => m.active && m.qualification === "approved")
                    .map((m) => (
                      <option key={m.account_id} value={m.account_id}>
                        {m.display_name}
                      </option>
                    ))}
                </select>
              </label>
              <fieldset>
                <legend>Assigned categories</legend>
                {categories.map((c) => (
                  <label key={c}>
                    <input name="categories" value={c} type="checkbox" />
                    {c}
                  </label>
                ))}
              </fieldset>
              <Btn type="submit" disabled={busy}>
                Assign
              </Btn>
            </form>
          )}
        </>
      )}
    </section>
  );
}
