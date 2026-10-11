"use client";
import { useState } from "react";
import Link from "next/link";
import { Btn } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/client-api";
type Profile = {
  profile: { status: string; version: number; privileges: string[] } | null;
  applications: { id: string; legal_name: string; profession: string }[];
};
export function ProfessionalProfile({ initial }: { initial: Profile }) {
  const [data, setData] = useState(initial),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  return (
    <section className="patient-page">
      <h1>Professional profile</h1>
      <p>
        Your existing account also holds your professional profile.
        Qualification requires manual review.
      </p>
      <p>Status: {data.profile?.status ?? "Not submitted"}</p>
      {data.profile?.status === "approved" ? (
        <Link href="/clinician/dashboard">Open practitioner workspace</Link>
      ) : (
        <p>
          Clinical tools remain unavailable until your qualification and
          privileges are approved.
        </p>
      )}
      {!["approved", "suspended"].includes(data.profile?.status ?? "") && (
        <form
          className="account-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setMessage("");
            const f = new FormData(e.currentTarget);
            try {
              const file = f.get("credential") as File;
              if (file.size > 5 * 1024 * 1024)
                throw Error("Credential exceeds 5MB");
              const bytes = new Uint8Array(await file.arrayBuffer());
              let binary = "";
              for (const byte of bytes) binary += String.fromCharCode(byte);
              await api("/api/practitioner", {
                legalName: f.get("legalName"),
                profession: f.get("profession"),
                registrationNumber: f.get("registrationNumber"),
                jurisdiction: f.get("jurisdiction"),
                filename: file.name,
                base64: btoa(binary),
                requestKey: crypto.randomUUID(),
              });
              setData(await api<Profile>("/api/practitioner"));
              setMessage("Submitted for manual review.");
            } catch (error) {
              setMessage(errorMessage(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          {[
            ["legalName", "Legal name"],
            ["profession", "Profession"],
            ["registrationNumber", "Registration number"],
            ["jurisdiction", "Licensing jurisdiction"],
          ].map(([name, label]) => (
            <label key={name}>
              {label}
              <input name={name} required maxLength={200} />
            </label>
          ))}
          <label>
            Credential PDF (maximum 5MB)
            <input
              name="credential"
              type="file"
              accept="application/pdf"
              required
            />
          </label>
          <Btn type="submit" disabled={busy}>
            Submit credentials
          </Btn>
        </form>
      )}
      <p role="status">{message}</p>
      <Link href="/profile">Patient account</Link>
    </section>
  );
}
