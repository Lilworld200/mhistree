"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { api, errorMessage } from "@/lib/client-api";
import { AuthField } from "./auth-field";
import { Btn } from "@/components/ui/button";

export function EmailCallback({ recovery = false }: { recovery?: boolean }) {
  const busy = useRef(false);
  const ready = recovery;
  const [pending, setPending] = useState(false),
    [error, setError] = useState(
      recovery ? "" : "This link is invalid or expired. Request a new link.",
    ),
    [done, setDone] = useState(false);
  return (
    <main className="account-stage">
      <section className="account-card">
        <h1>{recovery ? "Choose a new password" : "Verify your email"}</h1>
        {!recovery && !error && <p role="status">Verifying your email…</p>}
        {recovery && ready && !done && (
          <form
            method="post"
            action="/api/auth/reset-password"
            className="account-form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy.current) return;
              const data = new FormData(event.currentTarget);
              if (data.get("password") !== data.get("confirm")) {
                setError("Passwords do not match.");
                return;
              }
              busy.current = true;
              setPending(true);
              setError("");
              try {
                await api("/api/auth/reset-password", {
                  password: data.get("password"),
                });
                setDone(true);
              } catch (caught) {
                setError(errorMessage(caught));
              } finally {
                busy.current = false;
                setPending(false);
              }
            }}
          >
            <AuthField
              label="New password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
            <AuthField
              label="Confirm password"
              name="confirm"
              type="password"
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
            <Btn kind="dark" type="submit" disabled={pending}>
              {pending ? "Updating…" : "Update password"}
            </Btn>
          </form>
        )}
        {error && <p role="alert">{error}</p>}
        {done && (
          <p role="status">
            Password updated. Your previous sign-in sessions have ended.
          </p>
        )}
        <p className="account-navigation">
          <Link
            className="account-link"
            href={recovery && !done ? "/recovery" : "/auth"}
          >
            {recovery && !done ? "Request another link" : "Back to sign in"}
          </Link>
        </p>
      </section>
    </main>
  );
}
