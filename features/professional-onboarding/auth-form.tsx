"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { api, errorMessage } from "@/lib/client-api";
import type { ProfessionalEntry } from "@/features/auth/entry-path";
import { OnboardingFrame } from "./frame";
import { ProfessionalField } from "./fields";

export function ProfessionalAuthForm({
  entry,
  verificationPending = false,
}: {
  entry: ProfessionalEntry;
  verificationPending?: boolean;
}) {
  const [verifying, setVerifying] = useState(verificationPending),
    [email, setEmail] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const requestKey = useRef("");
  const lock = useRef(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (lock.current) return;
    const form = e.currentTarget,
      data = new FormData(form);
    setError("");
    if (data.get("password") !== data.get("confirm")) {
      setError("Your passwords do not match.");
      return;
    }
    lock.current = true;
    setBusy(true);
    try {
      const address = String(data.get("email"));
      requestKey.current ||= btoa(
        String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
      )
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
      await api("/api/auth/signup", {
        displayName: data.get("displayName"),
        email: address,
        password: data.get("password"),
        requestKey: requestKey.current,
        entry,
      });
      setEmail(address);
      form.reset();
      setVerifying(true);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <OnboardingFrame entry={entry} stage={verifying ? 1 : 0}>
      {verifying ? (
        <>
          <h2>Check your inbox</h2>
          <p className="pro-lead">
            Open the verification link{" "}
            {email ? (
              <>
                sent to <strong>{email}</strong>
              </>
            ) : (
              "in your email"
            )}{" "}
            to continue your{" "}
            {entry === "practitioner" ? "professional" : "organization"}{" "}
            application.
          </p>
          <div className="pro-info">
            <h3>What happens next?</h3>
            <p>
              After verification, you’ll return here to add{" "}
              {entry === "practitioner"
                ? "your registration details and credential document"
                : "your organization details and administrator authority"}
              . Email verification does not approve the application.
            </p>
          </div>
          <form
            className="pro-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (lock.current) return;
              lock.current = true;
              setBusy(true);
              setError("");
              try {
                const result = await api<{ message: string }>(
                  "/api/auth/resend-verification",
                  { email },
                );
                setNotice(result.message);
              } catch (err) {
                setError(errorMessage(err));
              } finally {
                lock.current = false;
                setBusy(false);
              }
            }}
          >
            <ProfessionalField
              label="Email address"
              name="resendEmail"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <button className="pro-button secondary" disabled={busy}>
              Resend verification email
            </button>
          </form>
          <Link className="pro-text-link" href="/auth">
            Already verified? Sign in →
          </Link>
        </>
      ) : (
        <>
          <form className="pro-form" onSubmit={submit}>
            {
              <ProfessionalField
                label={
                  entry === "practitioner"
                    ? "Your full name"
                    : "Administrator’s full name"
                }
                name="displayName"
                autoComplete="name"
                maxLength={200}
                required
                hint={
                  entry === "organization"
                    ? "The person responsible for this application, not the organization’s name."
                    : undefined
                }
              />
            }
            <ProfessionalField
              label="Email address"
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              required
            />
            <ProfessionalField
              label="Password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
              hint="Use at least 12 characters."
            />
            {
              <ProfessionalField
                label="Confirm password"
                name="confirm"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />
            }
            <button className="pro-button" disabled={busy}>
              {busy ? "Please wait…" : "Create account & verify email"}
            </button>
          </form>
          <p className="pro-switch">
            Already have a Mhistree account? <Link href="/auth">Sign in</Link>,
            then continue registration from your account.
          </p>
        </>
      )}
      {error && (
        <p className="pro-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="pro-info" role="status">
          {notice}
        </p>
      )}
    </OnboardingFrame>
  );
}
