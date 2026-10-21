"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, errorMessage } from "@/lib/client-api";
import { OnboardingFrame } from "./frame";
import { ProfessionalField } from "./fields";
import type { ProfessionalEntry } from "@/features/auth/entry-path";

export type ProfileApplication = {
  profile: { status: string; version: number; privileges: string[] } | null;
  applications: {
    id: string;
    legal_name: string;
    profession: string;
    registration_number?: string;
    jurisdiction?: string;
  }[];
};
export type OrganizationApplication = {
  id: string;
  legal_name: string;
  status: string;
  registration_number: string;
  jurisdiction: string;
  privileges?: string[];
};
type Draft = {
  legalName: string;
  profession: string;
  registrationNumber: string;
  jurisdiction: string;
  address: string;
  administratorCapacity: string;
};
const blank: Draft = {
  legalName: "",
  profession: "",
  registrationNumber: "",
  jurisdiction: "",
  address: "",
  administratorCapacity: "",
};

function Review({
  values,
  edit,
}: {
  values: [string, string][];
  edit?: () => void;
}) {
  return (
    <div className="pro-summary">
      <div className="pro-summary-heading">
        <h3>Application summary</h3>
        {edit && (
          <button type="button" className="pro-text-link" onClick={edit}>
            Edit details
          </button>
        )}
      </div>
      <dl>
        {values.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value || "Not provided"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
function Status({
  entry,
  status,
  name,
  refresh,
}: {
  entry: ProfessionalEntry;
  status: string;
  name: string;
  refresh: () => void;
}) {
  const approved = status === "approved";
  return (
    <div className="pro-status" role="status">
      <span className={`pro-status-badge ${approved ? "approved" : ""}`}>
        {status === "pending" ? "Under review" : status}
      </span>
      <h2>
        {approved
          ? "You're ready to continue"
          : status === "pending"
            ? "Your application is with our review team"
            : status === "suspended"
              ? "Your access is paused"
              : "Your application needs attention"}
      </h2>
      <p className="pro-lead">{name}</p>
      <div className="pro-info">
        <h3>{approved ? "Your next step" : "What happens next?"}</h3>
        <p>
          {approved
            ? "Your workspace will show the tools and permissions available to your account."
            : status === "pending"
              ? entry === "practitioner"
                ? "We’ll review your registration details and credential document against an authoritative source. Clinical access stays unavailable until approval."
                : "We’ll review the organization registration and your authority to administer it. Organization approval does not grant clinical qualifications or access to patient records."
              : "Your previous application is retained. Check your status here before continuing; no clinical access is granted by submitting another form."}
        </p>
      </div>
      <div className="pro-actions">
        <button
          type="button"
          className="pro-button secondary"
          onClick={refresh}
        >
          Refresh status
        </button>
        {approved && (
          <Link
            className="pro-button"
            href={
              entry === "practitioner"
                ? "/clinician/dashboard"
                : "/organizations"
            }
          >
            Open workspace →
          </Link>
        )}
      </div>
    </div>
  );
}

export function ApplicationFlow({
  entry,
  initialProfile,
  initialOrganizations = [],
  accountName = "",
}: {
  entry: ProfessionalEntry;
  initialProfile?: ProfileApplication;
  initialOrganizations?: OrganizationApplication[];
  accountName?: string;
}) {
  const router = useRouter();
  const professional = entry === "practitioner";
  const prior = initialProfile?.applications[0];
  const [draft, setDraft] = useState<Draft>({
    ...blank,
    legalName: professional ? (prior?.legal_name ?? accountName) : "",
    profession: prior?.profession ?? "",
    registrationNumber: professional ? (prior?.registration_number ?? "") : "",
    jurisdiction: professional ? (prior?.jurisdiction ?? "") : "",
  });
  const [step, setStep] = useState(0),
    [file, setFile] = useState<File | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [submittedId, setSubmittedId] = useState(""),
    [creating, setCreating] = useState(initialOrganizations.length === 0);
  const requestKey = useRef<string | null>(null),
    lock = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  function go(next: number) {
    setStep(next);
    setError("");
    requestAnimationFrame(() => {
      heading.current?.focus();
      heading.current?.scrollIntoView?.({ block: "nearest" });
    });
  }
  const field = (
    name: keyof Draft,
    label: string,
    hint?: string,
    maxLength = 200,
  ) => (
    <ProfessionalField
      name={name}
      label={label}
      value={draft[name]}
      onChange={(e) => setDraft({ ...draft, [name]: e.target.value })}
      required
      minLength={name === "registrationNumber" ? 1 : 2}
      maxLength={maxLength}
      hint={hint}
      autoComplete={
        name === "legalName" ? (professional ? "name" : "organization") : "off"
      }
    />
  );
  const status = submittedId
    ? (initialOrganizations.find((o) => o.id === submittedId)?.status ??
      "pending")
    : initialProfile?.profile?.status;
  const blocked = professional && status && status !== "rejected";
  const values: [string, string][] = professional
    ? [
        ["Name on registration", draft.legalName],
        ["Profession", draft.profession],
        ["Registration number", draft.registrationNumber],
        ["Licensing jurisdiction", draft.jurisdiction],
        ["Credential document", file?.name ?? ""],
      ]
    : [
        ["Registered organization name", draft.legalName],
        ["Registration / licence number", draft.registrationNumber],
        ["Registration jurisdiction", draft.jurisdiction],
        ["Registered address", draft.address],
        ["Administrator authority", draft.administratorCapacity],
      ];
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lock.current) return;
    if (!e.currentTarget.reportValidity()) return;
    if (step < 2) {
      if (professional && step === 1 && !file) {
        setError("Choose a credential PDF before continuing.");
        return;
      }
      go(step + 1);
      return;
    }
    setError("");
    lock.current = true;
    setBusy(true);
    try {
      requestKey.current ??= crypto.randomUUID();
      let result: { id: string };
      if (professional) {
        if (!file)
          throw new Error("Choose a credential PDF before submitting.");
        const bytes = new Uint8Array(await file.arrayBuffer());
        let binary = "";
        for (const byte of bytes) binary += String.fromCharCode(byte);
        result = await api("/api/practitioner", {
          legalName: draft.legalName,
          profession: draft.profession,
          registrationNumber: draft.registrationNumber,
          jurisdiction: draft.jurisdiction,
          filename: file.name,
          base64: btoa(binary),
          requestKey: requestKey.current,
        });
      } else {
        result = await api("/api/organizations", {
          legalName: draft.legalName,
          registrationNumber: draft.registrationNumber,
          jurisdiction: draft.jurisdiction,
          address: draft.address,
          administratorCapacity: draft.administratorCapacity,
          requestKey: requestKey.current,
        });
      }
      setSubmittedId(result.id);
      setFile(null);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <OnboardingFrame
      entry={entry}
      stage={
        submittedId || blocked || (!professional && !creating) ? 4 : step + 2
      }
    >
      {submittedId || blocked ? (
        <Status
          entry={entry}
          status={submittedId ? (status ?? "pending") : status!}
          name={
            submittedId ? draft.legalName : (prior?.legal_name ?? accountName)
          }
          refresh={() => router.refresh()}
        />
      ) : !professional && !creating ? (
        <>
          <span className="pro-kicker">ORGANIZATION ACCESS</span>
          <h2>Your organizations & applications</h2>
          <p className="pro-lead">
            Continue with an existing organization, check an application, or
            register another organization.
          </p>
          <div className="pro-application-list">
            {initialOrganizations.map((org) => (
              <article key={org.id}>
                <div>
                  <span className="pro-status-badge">
                    {org.status === "pending" ? "Under review" : org.status}
                  </span>
                  <h3>{org.legal_name}</h3>
                  <p>
                    {org.registration_number} · {org.jurisdiction}
                  </p>
                </div>
                {org.status === "approved" ? (
                  <Link className="pro-text-link" href="/organizations">
                    Open workspace →
                  </Link>
                ) : (
                  <p>Access follows manual review and approval.</p>
                )}
              </article>
            ))}
          </div>
          <div className="pro-actions">
            <button
              className="pro-button"
              type="button"
              onClick={() => setCreating(true)}
            >
              Register another organization
            </button>
            <button
              className="pro-button secondary"
              onClick={() => router.refresh()}
            >
              Refresh status
            </button>
          </div>
        </>
      ) : (
        <>
          <span className="pro-kicker">
            STEP {String(step + 3).padStart(2, "0")} ·{" "}
            {professional
              ? "PROFESSIONAL APPLICATION"
              : "ORGANIZATION APPLICATION"}
          </span>
          <h2 ref={heading} tabIndex={-1}>
            {step === 0
              ? professional
                ? "Tell us about your practice"
                : "Introduce your organization"
              : step === 1
                ? professional
                  ? "Add your registration evidence"
                  : "Location & administrator authority"
                : "Review your application"}
          </h2>
          <p className="pro-lead">
            {step === 0
              ? professional
                ? "Use the details shown on your professional registration. Your profession does not assign permissions automatically."
                : "Use the organization’s registered details. Healthcare organizations may include clinics, hospitals, pharmacies and diagnostic providers."
              : step === 1
                ? professional
                  ? "Upload a legible document that supports your registration or current practising licence."
                  : "Tell us where the organization operates and why you are authorized to apply on its behalf."
                : "Check these details before sending them to the Mhistree review team."}
          </p>
          <form className="pro-form" onSubmit={submit}>
            {step === 0 && (
              <>
                {field(
                  "legalName",
                  professional
                    ? "Full name on professional registration"
                    : "Registered organization name",
                )}
                {professional && (
                  <>
                    <ProfessionalField
                      name="profession"
                      label="Profession"
                      list="pro-professions"
                      required
                      minLength={2}
                      maxLength={100}
                      value={draft.profession}
                      onChange={(e) =>
                        setDraft({ ...draft, profession: e.target.value })
                      }
                      hint="Choose a suggestion or enter your registered profession."
                    />
                    <datalist id="pro-professions">
                      {[
                        "Medical practitioner",
                        "Dentist",
                        "Nurse",
                        "Midwife",
                        "Pharmacist",
                        "Physiotherapist",
                        "Medical laboratory scientist",
                        "Radiographer",
                        "Other allied health professional",
                      ].map((p) => (
                        <option key={p} value={p} />
                      ))}
                    </datalist>
                  </>
                )}
                {field(
                  "registrationNumber",
                  professional
                    ? "Professional registration number"
                    : "Organization registration / licence number",
                  "Enter it exactly as issued by the relevant authority.",
                  100,
                )}
                {field(
                  "jurisdiction",
                  professional
                    ? "Licensing country / jurisdiction"
                    : "Registration country / jurisdiction",
                  "Include the country and state or region where relevant.",
                  100,
                )}
              </>
            )}
            {step === 1 &&
              (professional ? (
                <>
                  <label className="pro-upload">
                    <span className="pro-upload-icon">↑</span>
                    <strong>
                      {file?.name ?? "Choose your credential document"}
                    </strong>
                    <span>PDF only · up to 5 MB</span>
                    <input
                      type="file"
                      name="credential"
                      accept="application/pdf,.pdf"
                      onChange={(e) => {
                        const chosen = e.target.files?.[0];
                        setError("");
                        if (!chosen) {
                          setFile(null);
                          return;
                        }
                        if (
                          chosen.size > 5 * 1024 * 1024 ||
                          !chosen.name.toLowerCase().endsWith(".pdf")
                        ) {
                          setError("Choose a PDF no larger than 5 MB.");
                          setFile(null);
                          e.target.value = "";
                          return;
                        }
                        setFile(chosen);
                      }}
                    />
                  </label>
                  <div className="pro-info">
                    <h3>What should the document show?</h3>
                    <p>
                      Your registered name, profession, registration details and
                      issuing authority. A current practising licence or
                      registration credential can support review. Upload only
                      your own professional evidence.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <label className="pro-field">
                    <span>Registered / operating address</span>
                    <textarea
                      name="address"
                      required
                      minLength={5}
                      maxLength={1000}
                      autoComplete="street-address"
                      value={draft.address}
                      onChange={(e) =>
                        setDraft({ ...draft, address: e.target.value })
                      }
                      rows={3}
                    />
                  </label>
                  <label className="pro-field">
                    <span>
                      Your role and authority to administer this organization
                    </span>
                    <textarea
                      name="administratorCapacity"
                      required
                      minLength={10}
                      maxLength={1000}
                      value={draft.administratorCapacity}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          administratorCapacity: e.target.value,
                        })
                      }
                      rows={4}
                      placeholder="Describe your role and the authorization you hold to submit this application."
                    />
                    <small>
                      This statement is reviewed. It does not grant
                      administrator access by itself.
                    </small>
                  </label>
                </>
              ))}
            {step === 2 && (
              <>
                <Review values={values} edit={() => go(0)} />
                <label className="pro-declaration">
                  <input type="checkbox" name="declaration" required />
                  <span>
                    I confirm that these details are accurate, I am authorized
                    to submit this application, and I understand that access
                    requires review.
                  </span>
                </label>
              </>
            )}
            {error && (
              <div className="pro-error" role="alert">
                <p>{error}</p>
                <button
                  type="button"
                  className="pro-text-link"
                  onClick={() => {
                    if (!professional) setCreating(false);
                    router.refresh();
                  }}
                >
                  Check saved application status
                </button>
              </div>
            )}
            <div className="pro-actions">
              {step > 0 && (
                <button
                  type="button"
                  className="pro-button secondary"
                  disabled={busy}
                  onClick={() => go(step - 1)}
                >
                  ← Back
                </button>
              )}
              <button className="pro-button" disabled={busy}>
                {busy
                  ? "Submitting…"
                  : step === 2
                    ? "Submit for review →"
                    : "Continue →"}
              </button>
            </div>
            <p className="pro-save-note">
              Your application is saved when you submit. Keep this page open
              while you complete it.
            </p>
          </form>
        </>
      )}
      <div className="pro-bottom-links">
        <Link href="/chat">Your personal health account</Link>
        {!professional && (
          <Link href="/organizations/staff">Have a team invitation?</Link>
        )}
      </div>
    </OnboardingFrame>
  );
}
