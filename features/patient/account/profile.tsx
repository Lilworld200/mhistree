"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Btn } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { ConnectionApprovalSettings } from "@/features/access/approval-settings-view";
import { SidePanel } from "@/components/ui/side-panel";
import { api, errorMessage } from "@/lib/client-api";

export type Profile = {
  accountId: string;
  patientId?: string | null;
  display_name: string;
  birth_date: string | null;
  profile_version: number;
  login_identifier: string;
  loginEmail?: string | null;
  contacts: {
    id: string;
    kind: string;
    address: string;
    verified_at: string | null;
  }[];
};
export function ProfileView({
  initial,
  canSwitchWorkspace = false,
  currentWorkspace = "personal",
}: {
  initial: Profile;
  canSwitchWorkspace?: boolean;
  currentWorkspace?: "personal" | "practitioner";
}) {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(initial),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const trigger = useRef<HTMLElement | null>(null);
  async function save(action: string, data: unknown) {
    setPending(true);
    setError("");
    setMessage("");
    try {
      await api("/api/account", { action, data });
      setProfile(await api<Profile>("/api/account"));
      setMessage("Changes saved.");
      router.refresh();
      return true;
    } catch (e) {
      if (
        e instanceof Error &&
        ["AUTH_REQUIRED", "SESSION_RETIRED", "ACCESS_REVOKED"].includes(
          e.message,
        )
      ) {
        setProfile(null);
        setEditing(false);
      }
      setError(errorMessage(e));
      return false;
    } finally {
      setPending(false);
    }
  }
  if (!profile)
    return (
      <section className="patient-page">
        <div className="card daily-section" role="alert">
          <p>{error || "Please sign in to view your profile."}</p>
          <Btn asChild>
            <Link href="/auth">Sign in</Link>
          </Btn>
        </div>
      </section>
    );
  const loginEmail =
    profile.loginEmail ??
    (profile.loginEmail === undefined && profile.login_identifier.includes("@")
      ? profile.login_identifier
      : null);
  const contacts = profile.contacts.filter(
    (contact) =>
      !(
        contact.kind === "email" &&
        contact.address.toLowerCase() === loginEmail?.toLowerCase()
      ),
  );
  const birthday = profile.birth_date
    ? new Intl.DateTimeFormat(undefined, {
        dateStyle: "long",
        timeZone: "UTC",
      }).format(new Date(`${profile.birth_date}T12:00:00Z`))
    : "Not added";
  return (
    <section className="patient-page restored-profile">
      <header className="hero">
        <div className="hrow">
          <span className="hid">
            <span className="profile-avatar">
              {profile.display_name.slice(0, 1).toUpperCase()}
            </span>
            <b>{profile.display_name}</b>
          </span>
          <Btn
            sm
            className="profile-edit-trigger"
            onClick={(event) => {
              trigger.current = event.currentTarget;
              setEditing(true);
              setError("");
              setMessage("");
            }}
          >
            Edit profile <Icon n="edit" s={15} />
          </Btn>
        </div>
        <div className="hcenter profile-id-block">
          <h1 className="hsub">Mhistree ID</h1>
          {profile.patientId ? (
            <>
              <code className="profile-patient-id">{profile.patientId}</code>
              <Btn
                sm
                className="profile-copy-id"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(profile.patientId!);
                    setMessage("Mhistree ID copied.");
                  } catch {
                    setMessage("Select your Mhistree ID to copy it.");
                  }
                }}
              >
                Copy ID
              </Btn>
              <p className="hsub profile-id-help">
                Share this ID with your care team. Access still needs your
                permission.
              </p>
            </>
          ) : (
            <p className="hsub">Your Mhistree ID is not available yet.</p>
          )}
        </div>
      </header>
      <div className="profile-details-grid">
        <section className="card daily-section profile-detail-card">
          <h2>Personal details</h2>
          <dl className="profile-details">
            <div>
              <dt>Date of birth</dt>
              <dd>{birthday}</dd>
            </div>
            <div>
              <dt>Sign-in email</dt>
              <dd>{loginEmail ?? "Not available"}</dd>
            </div>
          </dl>
        </section>
        <section className="card daily-section profile-detail-card">
          <h2>Contact details</h2>
          {contacts.length ? (
            <ul className="profile-contact-list">
              {contacts.map((contact) => (
                <li key={contact.id}>
                  <div>
                    <span className="sharing-help">
                      {contact.kind === "phone" ? "Phone" : "Additional email"}
                    </span>
                    <p>{contact.address}</p>
                  </div>
                  <span className="badge">
                    {contact.verified_at ? "Verified" : "Unverified"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="sharing-help">No additional contacts added.</p>
          )}
        </section>
        {canSwitchWorkspace && (
          <section
            className="card daily-section profile-detail-card"
            aria-label="Workspace settings"
          >
            <h2>Workspace</h2>
            <p className="sharing-help">
              {currentWorkspace === "practitioner"
                ? "Practitioner"
                : "Personal health"}
            </p>
            <Btn kind="soft" asChild>
              <Link
                href={
                  currentWorkspace === "practitioner"
                    ? "/chat"
                    : "/clinician/dashboard"
                }
              >
                {currentWorkspace === "practitioner"
                  ? "Switch to personal health"
                  : "Switch to practitioner workspace"}
              </Link>
            </Btn>
          </section>
        )}
        <section className="card daily-section profile-detail-card">
          <h2>Account</h2>
          <ConnectionApprovalSettings role="patient" />
          <div className="profile-account-links">
            <Link href="/recovery">
              Password and recovery <Icon n="chev" s={17} />
            </Link>
            <Link href="/identity/duplicates">
              Report a duplicate record <Icon n="chev" s={17} />
            </Link>
          </div>
          <Btn
            disabled={pending}
            onClick={async () => {
              setPending(true);
              setError("");
              try {
                await api("/api/auth/logout", {});
                router.replace("/auth");
                router.refresh();
              } catch (e) {
                setError(errorMessage(e));
                setPending(false);
              }
            }}
          >
            Sign out
          </Btn>
        </section>
      </div>
      {!editing && error && <p role="alert">{error}</p>}
      <p className="profile-feedback" role="status">
        {message}
      </p>
      {editing && (
        <SidePanel
          className="profile-editor-panel"
          title="Edit profile"
          description="Your personal details and contact information."
          onClose={() => {
            if (!pending) setEditing(false);
          }}
          returnFocus={() => trigger.current}
        >
          <div className="sharing-panel-body">
            <form
              className="account-form practitioner-panel-form"
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                if (
                  await save("profile", {
                    displayName: form.get("displayName"),
                    birthDate: form.get("birthDate") || null,
                    version: profile.profile_version,
                  })
                )
                  setEditing(false);
              }}
            >
              <label>
                Full name
                <input
                  name="displayName"
                  autoComplete="name"
                  defaultValue={profile.display_name}
                  required
                  maxLength={200}
                  disabled={pending}
                />
              </label>
              <label>
                Date of birth (optional)
                <input
                  name="birthDate"
                  type="date"
                  autoComplete="bday"
                  defaultValue={profile.birth_date ?? ""}
                  disabled={pending}
                />
              </label>
              <Btn type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save profile"}
              </Btn>
            </form>
            <section className="profile-edit-contacts">
              <h3>Contact details</h3>
              <p className="sharing-help">
                Additional contacts are separate from your sign-in email. New
                contacts start unverified.
              </p>
              {profile.contacts.map((contact) => (
                <article className="profile-edit-contact" key={contact.id}>
                  <div>
                    <p>{contact.address}</p>
                    <span className="badge">
                      {contact.verified_at ? "Verified" : "Unverified"}
                    </span>
                  </div>
                  {contact.kind === "email" &&
                  contact.address.toLowerCase() ===
                    loginEmail?.toLowerCase() ? (
                    <span className="sharing-help">Sign-in email</span>
                  ) : (
                    <Btn
                      sm
                      disabled={pending}
                      onClick={() =>
                        void save("remove-contact", { id: contact.id })
                      }
                    >
                      Remove contact
                    </Btn>
                  )}
                </article>
              ))}
              <form
                className="account-form practitioner-panel-form"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const formElement = event.currentTarget,
                    form = new FormData(formElement);
                  if (
                    await save("add-contact", {
                      kind: form.get("kind"),
                      address: form.get("address"),
                    })
                  )
                    formElement.reset();
                }}
              >
                <label>
                  Contact type
                  <select name="kind" disabled={pending}>
                    <option value="email">Email</option>
                    <option value="phone">Phone</option>
                  </select>
                </label>
                <label>
                  Email or phone number
                  <input
                    name="address"
                    required
                    maxLength={254}
                    disabled={pending}
                  />
                </label>
                <p className="sharing-help">
                  Use international + format for phone numbers.
                </p>
                <Btn type="submit" disabled={pending}>
                  Add contact
                </Btn>
              </form>
            </section>
            <details className="profile-staff-reference">
              <summary>Joining an organization as staff?</summary>
              <p className="sharing-help">
                This account reference is for staff invitations. For your own
                care, share your Mhistree ID instead.
              </p>
              <code>{profile.accountId}</code>
            </details>
            {error && <p role="alert">{error}</p>}
            <p role="status">{message}</p>
          </div>
        </SidePanel>
      )}
    </section>
  );
}
