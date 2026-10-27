"use client";
import { useRef, useState } from "react";
import { AuthField } from "./auth-field";
import { Btn } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/client-api";

export function EmailRecoveryForm() {
  const [pending, setPending] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const busy = useRef(false);
  return (
    <details className="recovery-option" open>
      <summary>Reset by email</summary>
      <form
        method="post"
        action="/api/auth/reset-email"
        className="account-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy.current) return;
          busy.current = true;
          setPending(true);
          setError("");
          setMessage("");
          const email = new FormData(event.currentTarget).get("email");
          try {
            const result = await api<{ message: string }>(
              "/api/auth/reset-email",
              { email },
            );
            setMessage(result.message);
          } catch (caught) {
            setError(errorMessage(caught));
          } finally {
            busy.current = false;
            setPending(false);
          }
        }}
      >
        <AuthField
          label="Email address"
          type="email"
          name="email"
          autoComplete="email"
          maxLength={254}
          required
        />
        <Btn kind="dark" type="submit" disabled={pending}>
          {pending ? "Sending…" : "Send reset link"}
        </Btn>
        {message && <p role="status">{message}</p>}
        {error && <p role="alert">{error}</p>}
      </form>
    </details>
  );
}
