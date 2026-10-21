"use client";
import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import logo from "@/app/assets/images/logos/mhistree_black_logo.png";
import { Btn } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/client-api";
import { AuthField } from "./auth-field";
import {
  professionalAuthPath,
  type ProfessionalEntry,
} from "@/features/auth/entry-path";
import { ProfessionalHeader } from "./professional-header";
type Mode = "login" | "signup" | "redeem" | "setup";
export function AccountEntry({
  initialMode = "login",
  entry,
  verificationPending = false,
}: {
  initialMode?: Mode;
  entry?: ProfessionalEntry;
  verificationPending?: boolean;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode),
    [pending, setPending] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(
      verificationPending
        ? "Check your email for a verification link, then sign in."
        : "",
    ),
    [identifier, setIdentifier] = useState(""),
    [awaitingVerification, setAwaitingVerification] =
      useState(verificationPending);
  const enrollment = useRef("");
  const busy = useRef(false);
  function change(next: Mode) {
    setMode(next);
    setError("");
    setNotice("");
    setAwaitingVerification(false);
    enrollment.current = "";
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
          email: values.get("email"),
          password: values.get("password"),
          requestKey: enrollment.current,
          ...(entry ? { entry } : {}),
        });
        if (entry) {
          router.replace(`${professionalAuthPath(entry)}&verification=pending`);
          router.refresh();
          return;
        }
        setIdentifier(String(values.get("email")));
        setMode("login");
        enrollment.current = "";
        setNotice("Check your email for a verification link, then sign in.");
        setAwaitingVerification(true);
        form.reset();
      } else if (mode === "redeem") {
        await api("/api/auth/redeem", { code: values.get("code") });
        setMode("setup");
      } else if (mode === "setup") {
        if (values.get("password") !== values.get("confirm")) {
          setError("Passwords do not match.");
          return;
        }
        if (!enrollment.current) {
          enrollment.current =
            crypto.randomUUID().replaceAll("-", "") +
            crypto.randomUUID().replaceAll("-", "").slice(0, 11);
        }
        const result = await api<{
          loginIdentifier?: string;
          verificationRequired: boolean;
        }>("/api/auth/setup", {
          email: values.get("email"),
          password: values.get("password"),
          requestKey: enrollment.current,
        });
        setIdentifier(result.loginIdentifier ?? String(values.get("email")));
        setAwaitingVerification(result.verificationRequired);
        setNotice(
          result.verificationRequired
            ? "Check your email to verify and activate your existing care record."
            : "Password updated. Sign in with your email.",
        );
        setMode("login");
        form.reset();
      } else {
        const result = await api<{ next: string }>("/api/auth/login", {
          identifier,
          password: values.get("password"),
          ...(entry ? { entry } : {}),
        });
        router.replace(result.next);
        router.refresh();
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  const heading =
    mode === "login"
      ? entry
        ? `${entry === "practitioner" ? "Healthcare professional" : "Organization"} sign in`
        : "Sign in"
      : mode === "signup"
        ? entry
          ? `${entry === "practitioner" ? "Healthcare professional" : "Organization"} registration`
          : "Create your account"
        : mode === "redeem"
          ? "Use your setup or recovery code"
          : "Choose your password";
  const splitHeader = !entry && (mode === "login" || mode === "signup");
  return (
    <main className="account-stage">
      <section
        className={`account-card${entry ? " professional-access-card" : ""}`}
      >
        {entry && (mode === "login" || mode === "signup") ? (
          <>
            <ProfessionalHeader entry={entry} mode={mode} disabled={pending} />
            <div className="professional-access-heading">
              <h1>{mode === "login" ? "Sign in" : "Create your account"}</h1>
              <p className="muted">
                {entry === "practitioner"
                  ? mode === "login"
                    ? "Welcome back to your professional workspace."
                    : "Create an account to register your professional profile."
                  : mode === "login"
                    ? "Sign in to manage your organization or join your team."
                    : "Create an account to register your organization."}
              </p>
            </div>
          </>
        ) : splitHeader ? (
          <header className="account-auth-header">
            <div className="account-auth-heading">
              <h1>{heading}</h1>
              <p className="muted">Your health story, kept together.</p>
            </div>
            <Image
              src={logo}
              alt="Mhistree"
              height={54}
              className="account-auth-logo"
              priority
            />
          </header>
        ) : (
          <>
            <Image
              src={logo}
              alt="Mhistree"
              height={54}
              style={{ width: "auto", height: 54, margin: "0 auto 16px" }}
              priority
            />
            <h1>{heading}</h1>
            <p className="muted">
              {entry
                ? entry === "practitioner"
                  ? "Sign in or create an account to submit your professional credentials for review."
                  : "Sign in or create an account to register your organization or join your team."
                : "Your health story, kept together."}
            </p>
          </>
        )}
        <form key={mode} onSubmit={submit} className="account-form">
          {mode === "signup" && (
            <>
              <AuthField
                label="Full name"
                name="displayName"
                autoComplete="name"
                maxLength={200}
                required
              />
            </>
          )}
          {mode === "redeem" && (
            <AuthField
              label="Private setup or recovery code"
              name="code"
              autoComplete="one-time-code"
              spellCheck={false}
              required
              maxLength={200}
            />
          )}
          {mode === "login" && (
            <AuthField
              label="Email address"
              name="identifier"
              type="email"
              autoComplete="username"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              spellCheck={false}
              required
            />
          )}
          {(mode === "signup" || mode === "setup") && (
            <AuthField
              label="Email address"
              name="email"
              type="email"
              autoComplete="email"
              maxLength={254}
              required
            />
          )}
          {(mode === "login" || mode === "signup" || mode === "setup") && (
            <AuthField
              label="Password"
              name="password"
              type="password"
              autoComplete={
                mode === "login" ? "current-password" : "new-password"
              }
              minLength={mode === "login" ? 1 : 12}
              maxLength={128}
              required
            />
          )}
          {mode === "setup" && (
            <>
              <AuthField
                label="Confirm password"
                name="confirm"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
              />
              <p className="muted">
                Use at least 12 characters. Your care team never chooses or
                receives your password.
              </p>
            </>
          )}
          {notice && <p role="status">{notice}</p>}
          {mode === "login" && awaitingVerification && (
            <button
              className="account-link"
              type="button"
              disabled={pending}
              onClick={async () => {
                if (busy.current) return;
                busy.current = true;
                setPending(true);
                setError("");
                try {
                  const result = await api<{ message: string }>(
                    "/api/auth/resend-verification",
                    { email: identifier },
                  );
                  setNotice(result.message);
                } catch (caught) {
                  setError(errorMessage(caught));
                } finally {
                  busy.current = false;
                  setPending(false);
                }
              }}
            >
              Resend verification email
            </button>
          )}
          {error && <p role="alert">{error}</p>}
          <Btn kind="dark" type="submit" disabled={pending}>
            {pending
              ? "Please wait…"
              : mode === "login"
                ? "Sign in"
                : mode === "setup"
                  ? "Set password"
                  : mode === "signup"
                    ? "Sign up"
                    : "Continue"}
          </Btn>
          {(mode === "login" || mode === "signup") && (
            <div className="account-row">
              <Link className="account-recovery-link" href="/recovery">
                Forgot password?
              </Link>
              <p className="account-switch">
                <span>
                  {mode === "login"
                    ? "Don’t have an account? "
                    : "Have an account? "}
                </span>
                {entry ? (
                  <Link
                    className="account-link"
                    href={professionalAuthPath(
                      entry,
                      mode === "login" ? "signup" : "login",
                    )}
                    aria-disabled={pending}
                    onClick={(event) => {
                      if (pending) event.preventDefault();
                    }}
                  >
                    {mode === "login" ? "Sign up" : "Sign in"}
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="account-link"
                    onClick={() =>
                      change(mode === "login" ? "signup" : "login")
                    }
                    disabled={pending}
                  >
                    {mode === "login" ? "Sign up" : "Sign in"}
                  </button>
                )}
              </p>
            </div>
          )}
        </form>
        {(mode === "login" || mode === "signup") && (
          <div className="account-navigation">
            <div className="account-other-methods">
              <p className="account-divider">Other options</p>
              {!entry && mode === "signup" && (
                <>
                  <Link
                    className="account-link"
                    href={professionalAuthPath("practitioner", "signup")}
                  >
                    Register as a healthcare practitioner
                  </Link>
                  <Link
                    className="account-link"
                    href={professionalAuthPath("organization", "signup")}
                  >
                    Register an organization
                  </Link>
                </>
              )}
              {entry && (
                <Link className="account-link" href="/auth">
                  Patient sign in
                </Link>
              )}
              {mode === "login" && (
                <button
                  type="button"
                  className="account-link"
                  onClick={() => change("redeem")}
                  disabled={pending}
                >
                  Use a setup or recovery code
                </button>
              )}
            </div>
          </div>
        )}
        {mode === "redeem" && (
          <p className="account-navigation">
            <button
              type="button"
              className="account-link"
              onClick={() => change("login")}
              disabled={pending}
            >
              Back to sign in
            </button>
          </p>
        )}
      </section>
    </main>
  );
}
