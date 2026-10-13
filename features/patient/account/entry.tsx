"use client";
import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import logo from "@/app/assets/images/logos/mhistree_black_logo.png";
import { Btn } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/client-api";
type Mode = "login" | "signup" | "redeem" | "setup";
export function AccountEntry({
  initialMode = "login",
}: {
  initialMode?: Mode;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [identifier, setIdentifier] = useState("");
  const enrollment = useRef("");
  const busy = useRef(false);
  function change(next: Mode) {
    setMode(next);
    setError("");
    setNotice("");
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError("");
    const form = event.currentTarget;
    const values = new FormData(form);
    try {
      if (mode === "signup") {
        if (!enrollment.current) {
          const bytes = crypto.getRandomValues(new Uint8Array(32));
          enrollment.current = btoa(String.fromCharCode(...bytes))
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=/g, "");
        }
        await api("/api/auth/signup", {
          displayName: values.get("displayName"),
          birthDate: values.get("birthDate") || null,
          requestKey: enrollment.current,
        });
        setMode("setup");
      } else if (mode === "redeem") {
        await api("/api/auth/redeem", { code: values.get("code") });
        setMode("setup");
      } else if (mode === "setup") {
        if (values.get("password") !== values.get("confirm")) {
          setError("Passwords do not match.");
          return;
        }
        const result = await api<{ loginIdentifier: string }>(
          "/api/auth/setup",
          { password: values.get("password") },
        );
        setIdentifier(result.loginIdentifier);
        setNotice(
          "Account ready. Save your private login identifier below, then sign in.",
        );
        setMode("login");
        form.reset();
      } else {
        await api("/api/auth/login", {
          identifier,
          password: values.get("password"),
        });
        router.replace("/chat");
        router.refresh();
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  return (
    <main className="account-stage">
      <section className="account-card">
        <Image
          src={logo}
          alt="Mhistree"
          height={54}
          style={{ width: "auto", height: 54, margin: "0 auto 16px" }}
          priority
        />
        <h1>
          {mode === "login"
            ? "Welcome back"
            : mode === "signup"
              ? "Create your account"
              : mode === "redeem"
                ? "Claim your care record"
                : "Choose your password"}
        </h1>
        <p className="muted">Your health story, kept together.</p>
        {mode !== "setup" && (
          <div className="account-tabs">
            {(["login", "signup", "redeem"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => change(value)}
                disabled={pending}
              >
                {value === "login"
                  ? "Sign in"
                  : value === "signup"
                    ? "Register"
                    : "Setup code"}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={submit} className="account-form">
          {mode === "signup" && (
            <>
              <label>
                Full name
                <input
                  name="displayName"
                  autoComplete="name"
                  maxLength={200}
                  required
                />
              </label>
              <label>
                Date of birth (optional)
                <input name="birthDate" type="date" autoComplete="bday" />
              </label>
              <p className="muted">
                No email or phone is required. Already received care with
                Mhistree? Use your setup code to keep the same record.
              </p>
            </>
          )}
          {mode === "redeem" && (
            <label>
              Private setup or recovery code
              <input
                name="code"
                autoComplete="one-time-code"
                spellCheck={false}
                required
                maxLength={200}
              />
            </label>
          )}
          {mode === "login" && (
            <label>
              Private login identifier or verified email
              <input
                name="identifier"
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                spellCheck={false}
                required
              />
            </label>
          )}
          {(mode === "login" || mode === "setup") && (
            <label>
              Password
              <input
                name="password"
                type="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                minLength={mode === "setup" ? 12 : 1}
                maxLength={128}
                required
              />
            </label>
          )}
          {mode === "setup" && (
            <>
              <label>
                Confirm password
                <input
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                />
              </label>
              <p className="muted">
                Use at least 12 characters. Your care team never chooses or
                receives your password.
              </p>
            </>
          )}
          <p role="status">{notice}</p>
          {error && <p role="alert">{error}</p>}
          <Btn kind="dark" type="submit" disabled={pending}>
            {pending
              ? "Please wait…"
              : mode === "login"
                ? "Sign in"
                : mode === "setup"
                  ? "Set password"
                  : "Continue"}
          </Btn>
        </form>
        <p className="muted">
          Your public Mhistree ID is a record locator, not a login credential.
        </p>
        <p>
          <Link href="/recovery">Need help accessing your account?</Link>
        </p>
      </section>
    </main>
  );
}
