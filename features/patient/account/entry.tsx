"use client";
import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import logo from "@/app/assets/images/logos/mhistree_black_logo.png";
import { Btn } from "@/components/ui/button";
import { api, errorMessage } from "@/lib/client-api";
import { AuthField } from "./auth-field";
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
    [identifier, setIdentifier] = useState(""),
    [awaitingVerification, setAwaitingVerification] = useState(false);
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
          birthDate: values.get("birthDate") || null,
          email: values.get("email"),
          password: values.get("password"),
          requestKey: enrollment.current,
        });
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
            ? "Sign in"
            : mode === "signup"
              ? "Create your account"
              : mode === "redeem"
                ? "Use your setup or recovery code"
                : "Choose your password"}
        </h1>
        <p className="muted">Your health story, kept together.</p>
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
              <AuthField
                label="Date of birth (optional)"
                name="birthDate"
                type="date"
                autoComplete="bday"
              />
              <p className="muted">
                Already received care with Mhistree? Use your setup code to keep
                the same record.
              </p>
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
            <Link className="account-recovery-link" href="/recovery">
              Forgot password?
            </Link>
          )}
        </form>
        {(mode === "login" || mode === "signup") && (
          <div className="account-navigation">
            <p>
              {mode === "login"
                ? "Don’t have an account? "
                : "Already have an account? "}
              <button
                type="button"
                className="account-link"
                onClick={() => change(mode === "login" ? "signup" : "login")}
                disabled={pending}
              >
                {mode === "login" ? "Sign up" : "Sign in"}
              </button>
            </p>
            <div className="account-other-methods">
              <p className="account-divider">Other options</p>
              <button
                type="button"
                className="account-link"
                onClick={() => change("redeem")}
                disabled={pending}
              >
                Use a setup or recovery code
              </button>
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
