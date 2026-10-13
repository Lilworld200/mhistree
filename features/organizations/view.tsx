"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { Btn } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/client-api";
type Organization = {
  id: string;
  legal_name: string;
  status: string;
  version: number;
  registration_number: string;
  jurisdiction: string;
  address?: string;
  administrator_capacity?: string;
  privileges?: string[];
};
export function OrganizationView({
  initial,
  review = false,
}: {
  initial: Organization[];
  review?: boolean;
}) {
  const [rows, setRows] = useState(initial),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const requestKey = useRef<string | null>(null);
  const endpoint = review ? "/api/review/organizations" : "/api/organizations";
  async function submit(data: unknown) {
    setBusy(true);
    setMessage("");
    try {
      await api(endpoint, data);
      setRows(await api<Organization[]>(endpoint));
      setMessage("Saved.");
      requestKey.current = null;
    } catch (e) {
      setMessage(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="patient-page">
      <h1>{review ? "Organization review" : "Organizations"}</h1>
      {!review && (
        <Link href="/organizations/staff">
          Invitations and assigned patients
        </Link>
      )}
      {rows.length === 0 && <p>No organizations to display.</p>}
      {rows.map((org) => (
        <article className="record-item" key={org.id}>
          <h2>{org.legal_name}</h2>
          <p>
            {org.status} · {org.registration_number} · {org.jurisdiction}
          </p>
          {review && (
            <>
              <p>{org.address}</p>
              <p>Administrator capacity: {org.administrator_capacity}</p>
              <form
                className="account-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  void submit({
                    organizationId: org.id,
                    version: org.version,
                    decision: f.get("decision"),
                    evidence: f.get("evidence"),
                    administratorEvidence: f.get("administratorEvidence"),
                  });
                }}
              >
                <label>
                  Decision
                  <select name="decision" required>
                    <option value="">Select decision</option>
                    {org.status === "pending" && (
                      <option value="rejected">Reject</option>
                    )}
                    {["pending", "suspended"].includes(org.status) && (
                      <option value="approved">Approve</option>
                    )}
                    {org.status === "approved" && (
                      <option value="suspended">Suspend</option>
                    )}
                  </select>
                </label>
                <label>
                  Organization verification evidence
                  <textarea
                    name="evidence"
                    minLength={20}
                    maxLength={3000}
                    required
                  />
                </label>
                <label>
                  Administrator identity and authorization evidence
                  <textarea
                    name="administratorEvidence"
                    minLength={20}
                    maxLength={3000}
                    required
                  />
                </label>
                <Btn disabled={busy} type="submit">
                  Record decision
                </Btn>
              </form>
            </>
          )}
          {!review && (
            <p>
              {org.status === "approved"
                ? "Approved organization"
                : "Organizational care is unavailable until approval."}
            </p>
          )}
          {!review &&
            org.status === "approved" &&
            org.privileges?.some((p) =>
              [
                "organization.manage",
                "consent.manage",
                "assignments.manage",
              ].includes(p),
            ) && (
              <a href={`/organizations/staff?organization=${org.id}`}>
                Manage staff
              </a>
            )}
          {!review &&
            org.status === "approved" &&
            org.privileges?.includes("person.register") && (
              <a
                href={`/organizations/register-patient?organization=${org.id}`}
              >
                Register patient
              </a>
            )}
          {!review &&
            org.status === "approved" &&
            org.privileges?.some((p) =>
              ["auth.activate", "auth.recover", "person.lookup"].includes(p),
            ) && (
              <a href={`/organizations/assistance?organization=${org.id}`}>
                Identity assistance
              </a>
            )}
        </article>
      ))}
      {!review && (
        <form
          className="account-form"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            requestKey.current ??= crypto.randomUUID();
            void submit({
              legalName: f.get("legalName"),
              registrationNumber: f.get("registrationNumber"),
              jurisdiction: f.get("jurisdiction"),
              address: f.get("address"),
              administratorCapacity: f.get("administratorCapacity"),
              requestKey: requestKey.current,
            });
          }}
        >
          <h2>Register an organization</h2>
          <label>
            Legal name
            <input name="legalName" minLength={2} maxLength={200} required />
          </label>
          <label>
            Registration number
            <input name="registrationNumber" maxLength={100} required />
          </label>
          <label>
            Jurisdiction
            <input name="jurisdiction" minLength={2} maxLength={100} required />
          </label>
          <label>
            Address
            <textarea name="address" minLength={5} maxLength={1000} required />
          </label>
          <label>
            Your authority to administer this organization
            <textarea
              name="administratorCapacity"
              minLength={10}
              maxLength={1000}
              required
            />
          </label>
          <Btn disabled={busy} type="submit">
            Submit for review
          </Btn>
        </form>
      )}
      <p role="status">{message}</p>
    </section>
  );
}
