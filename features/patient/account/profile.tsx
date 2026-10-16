"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Btn } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/client-api";
type Profile = {
  accountId: string;
  display_name: string;
  birth_date: string | null;
  profile_version: number;
  login_identifier: string;
  contacts: {
    id: string;
    kind: string;
    address: string;
    verified_at: string | null;
  }[];
};
export function ProfileView({ initial }: { initial: Profile }) {
  const router = useRouter();
  const [profile, setProfile] = useState(initial),
    [pending, setPending] = useState(false),
    [message, setMessage] = useState("");
  async function save(action: string, data: unknown) {
    setPending(true);
    setMessage("");
    try {
      await api("/api/account", { action, data });
      setProfile(await api<Profile>("/api/account"));
      setMessage("Saved.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setPending(false);
    }
  }
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
          <span className="hpill">Your profile</span>
        </div>
        <div className="hcenter">
          <h1 className="display health-hero-title">Your health profile</h1>
          <span className="hsub">Personal details and account controls</span>
        </div>
      </header>
      <p>Organization invitation identifier: {profile.accountId}</p>
      <Link href="/identity/duplicates">
        Report a possible duplicate identity
      </Link>
      <p>
        Private login identifier: <strong>{profile.login_identifier}</strong>
      </p>
      <form
        className="account-form card profile-edit-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void save("profile", {
            displayName: f.get("displayName"),
            birthDate: f.get("birthDate") || null,
            version: profile.profile_version,
          });
        }}
      >
        <label>
          Full name
          <input
            name="displayName"
            defaultValue={profile.display_name}
            required
            maxLength={200}
          />
        </label>
        <label>
          Date of birth (optional)
          <input
            name="birthDate"
            type="date"
            defaultValue={profile.birth_date ?? ""}
          />
        </label>
        <Btn type="submit" disabled={pending}>
          Save profile
        </Btn>
      </form>
      <h2>Optional contacts</h2>
      <p>
        Adding a contact does not verify it or change account ownership.
        Continue using your private login identifier until email verification is
        available.
      </p>
      {profile.contacts.map((c) => (
        <div className="record-card" key={c.id}>
          <p>
            {c.address} · {c.verified_at ? "Verified" : "Unverified"}
          </p>
          <Btn
            disabled={pending}
            onClick={() => void save("remove-contact", { id: c.id })}
          >
            Remove contact
          </Btn>
        </div>
      ))}
      <form
        className="account-form"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void save("add-contact", {
            kind: f.get("kind"),
            address: f.get("address"),
          });
        }}
      >
        <label>
          Contact type
          <select name="kind">
            <option value="email">Email</option>
            <option value="phone">Phone (international + format)</option>
          </select>
        </label>
        <label>
          Address or number
          <input name="address" required maxLength={254} />
        </label>
        <Btn type="submit" disabled={pending}>
          Add unverified contact
        </Btn>
      </form>
      <p role="status">{message}</p>
      <Btn
        disabled={pending}
        onClick={async () => {
          setPending(true);
          try {
            await api("/api/auth/logout", {});
            router.replace("/auth");
            router.refresh();
          } catch (error) {
            setMessage(errorMessage(error));
            setPending(false);
          }
        }}
      >
        Sign out
      </Btn>
    </section>
  );
}
