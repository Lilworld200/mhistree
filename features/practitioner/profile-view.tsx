"use client";
import { useState } from "react";
import Link from "next/link";
import { Btn } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { MobileTopbarActions } from "@/components/layout/mobile-topbar-actions";
import { api, errorMessage } from "@/lib/client-api";
import { dateLabel } from "@/features/access/sharing-types";
export type ProfessionalProfileData = {
  profile: { status: string; version: number; privileges: string[] } | null;
  applications: {
    id: string;
    legal_name: string;
    profession: string;
    registration_number?: string;
    jurisdiction?: string;
    credential_name?: string;
    submitted_at?: string;
  }[];
};
const capabilityLabels: Record<string, string> = {
  "records.read": "Read authorized records",
  "records.write": "Contribute clinical care",
  "appointments.manage": "Manage appointments",
  "messages.send": "Send care messages",
  "requests.read": "View service requests",
  "requests.create": "Create service requests",
  "results.finalize": "Finalize results",
  "person.register": "Register a person without a login",
  "person.lookup": "Look up a person’s Mhistree ID",
  "auth.activate": "Issue authorized account setup",
};
const statusCopy: Record<string, { label: string; description: string }> = {
  approved: {
    label: "Approved",
    description:
      "Your professional profile is approved. Patient access still requires a valid connection, consent and any organization assignment.",
  },
  pending: {
    label: "Under review",
    description:
      "Your application is awaiting manual qualification review. Clinical work remains unavailable until approval.",
  },
  rejected: {
    label: "Not approved",
    description:
      "Your application was not approved. Review and resubmit your credentials through the application flow.",
  },
  suspended: {
    label: "Suspended",
    description:
      "Professional access is suspended. This status cannot be changed from your profile.",
  },
  none: {
    label: "Not submitted",
    description:
      "Complete your professional application to submit your qualifications for review.",
  },
};
export function ProfessionalProfile({
  initial,
}: {
  initial: ProfessionalProfileData;
}) {
  const [data, setData] = useState<ProfessionalProfileData | null>(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function refresh() {
    setBusy(true);
    try {
      setData(await api<ProfessionalProfileData>("/api/practitioner"));
      setError("");
    } catch (e) {
      setData(null);
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const current = data?.applications[0],
    status = data?.profile?.status ?? "none",
    copy = statusCopy[status] ?? statusCopy.none;
  return (
    <section className="patient-page sharing-page practitioner-professional-profile">
      <MobileTopbarActions>
        <Btn sm icon="clock" disabled={busy} onClick={() => void refresh()}>
          {busy ? "Refreshing…" : "Refresh"}
        </Btn>
      </MobileTopbarActions>
      <header className="phead sharing-desktop-header">
        <div>
          <h1 className="ptitle">Professional profile</h1>
          <p className="psub">
            Your submitted credentials, review status and professional
            capabilities.
          </p>
        </div>
        <Btn sm icon="clock" disabled={busy} onClick={() => void refresh()}>
          {busy ? "Refreshing…" : "Refresh status"}
        </Btn>
      </header>
      {error && (
        <div className="card daily-section" role="alert">
          <p>{error}</p>
          <Btn onClick={() => void refresh()} disabled={busy}>
            Retry profile
          </Btn>
        </div>
      )}
      {data && (
        <>
          <section className="card professional-identity">
            <span className="professional-profile-icon">
              <Icon n="steth" s={30} />
            </span>
            <div>
              <h2>{current?.legal_name ?? "Your professional profile"}</h2>
              <p>{current?.profession ?? "Qualifications not yet submitted"}</p>
              {current?.jurisdiction && <p>{current.jurisdiction}</p>}
            </div>
            <span
              className={`badge ${status === "approved" ? "professional-approved" : ""}`}
            >
              {copy.label}
            </span>
          </section>
          <section className="card daily-section">
            <div className="sharing-section-head">
              <h2>Review status</h2>
              <Icon n="shield" />
            </div>
            <p>{copy.description}</p>
            {["none", "pending", "rejected"].includes(status) && (
              <Btn kind="dark" asChild>
                <Link href="/auth/professional/practitioner">
                  {status === "pending"
                    ? "View application status"
                    : status === "rejected"
                      ? "Review and resubmit"
                      : "Complete application"}
                </Link>
              </Btn>
            )}
            {status === "approved" && (
              <p className="sharing-help">
                Approved credentials cannot be edited directly here.
                Qualification changes need a new review.
              </p>
            )}
          </section>
          <div className="daily-dashboard-grid">
            <section className="card daily-section">
              <div className="sharing-section-head">
                <h2>Professional credentials</h2>
                <Icon n="doc" />
              </div>
              <dl className="professional-details">
                <div>
                  <dt>Registered name</dt>
                  <dd>{current?.legal_name ?? "Not submitted"}</dd>
                </div>
                <div>
                  <dt>Profession</dt>
                  <dd>{current?.profession ?? "Not submitted"}</dd>
                </div>
                <div>
                  <dt>Registration reference</dt>
                  <dd>{current?.registration_number ?? "Not provided"}</dd>
                </div>
                <div>
                  <dt>Licensing jurisdiction</dt>
                  <dd>{current?.jurisdiction ?? "Not provided"}</dd>
                </div>
                <div>
                  <dt>Credential document</dt>
                  <dd>{current?.credential_name ?? "No document submitted"}</dd>
                </div>
                {current?.submitted_at && (
                  <div>
                    <dt>Submitted</dt>
                    <dd>
                      <time dateTime={current.submitted_at}>
                        {dateLabel(current.submitted_at)}
                      </time>
                    </dd>
                  </div>
                )}
              </dl>
            </section>
            <section className="card daily-section">
              <div className="sharing-section-head">
                <h2>Professional capabilities</h2>
                <Icon n="lock" />
              </div>
              <p className="sharing-help">
                These capabilities apply only in authorized care contexts. They
                do not connect patients or grant access to an organization’s
                records.
              </p>
              {status === "approved" && data.profile!.privileges.length ? (
                <ul className="professional-capabilities">
                  {data.profile!.privileges.map((privilege) => (
                    <li key={privilege}>
                      <Icon n="check" s={16} />
                      {capabilityLabels[privilege] ??
                        "Additional reviewed capability"}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>No active professional capabilities are shown.</p>
              )}
            </section>
          </div>
          <section className="card daily-section">
            <div className="sharing-section-head">
              <h2>Submitted applications</h2>
              <Icon n="clock" />
            </div>
            {data.applications.length ? (
              data.applications.map((application, index) => (
                <article className="daily-row" key={application.id}>
                  <span className="daily-row-icon">
                    <Icon n="doc" />
                  </span>
                  <div className="daily-row-main">
                    <h3>{application.profession}</h3>
                    <p>{application.legal_name}</p>
                    {application.submitted_at && (
                      <time dateTime={application.submitted_at}>
                        {dateLabel(application.submitted_at)}
                      </time>
                    )}
                    {application.credential_name && (
                      <p>{application.credential_name}</p>
                    )}
                  </div>
                  <span className="badge">
                    {index === 0 ? "Latest submission" : "Previous submission"}
                  </span>
                </article>
              ))
            ) : (
              <p>No professional application submitted yet.</p>
            )}
            <p className="sharing-help">
              Showing up to 10 submissions. A submission is not evidence of
              approval.
            </p>
          </section>
          <section className="card daily-section">
            <h2>Account & workspace settings</h2>
            <p>
              Your personal account and professional profile share one sign-in.
              Change workspace mode from your account profile.
            </p>
            <Btn asChild>
              <Link href="/profile?workspace=practitioner">
                Open account profile
              </Link>
            </Btn>
          </section>
        </>
      )}
    </section>
  );
}
