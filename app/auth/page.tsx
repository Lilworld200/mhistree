"use client";

import { useState, FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { createClient } from "@/lib/supabase/client";
import { Btn } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import logoWhite from "@/app/assets/images/logos/mhistree_white_logo.png";
import logoBlack from "@/app/assets/images/logos/mhistree_black_logo.png";
import { useShellStore } from "@/features/shell/store";

export default function AuthPage() {
  const router = useRouter();
  const theme = useShellStore((s) => s.theme);
  const [mode, setMode] = useState<"signin" | "signup">("signin");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);

  const supabase = createClient();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setLoading(true);

    // Normalize input before it reaches the auth service: trim stray
    // whitespace and compare emails case-insensitively.
    const cleanEmail = email.trim().toLowerCase();
    const cleanFirstName = firstName.trim();
    const cleanLastName = lastName.trim();

    try {
      if (mode === "signin") {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });

        if (error) {
          throw error;
        }

        if (data.session) {
          setSuccessMsg("Signed in successfully! Redirecting...");
          setTimeout(() => {
            router.push("/chat");
          }, 800);
        }
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            data: {
              first_name: cleanFirstName,
              last_name: cleanLastName,
            },
          },
        });

        if (error) {
          throw error;
        }

        if (data.session) {
          setSuccessMsg("Account created successfully! Redirecting...");
          setTimeout(() => {
            router.push("/chat");
          }, 800);
        } else {
          setSuccessMsg(
            "Account created! Please check your email for a confirmation link.",
          );
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Authentication failed";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem 1rem",
        position: "relative",
        background: "var(--shell, #ececeb)",
        color: "var(--ink, #1a1a1a)",
      }}
    >
      <button
        type="button"
        className="authback"
        onClick={() => router.push("/chat")}
      >
        <Icon n="left" s={17} />
        Back
      </button>
      <div
        className="card auth-card"
        style={{
          width: "100%",
          maxWidth: "440px",
          padding: "2.5rem 2rem",
          border: "1px solid var(--bl)",
          borderRadius: "32px",
          boxShadow: "0 24px 48px rgba(0, 0, 0, 0.4)",
        }}
      >
        {/* Brand Header */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginBottom: "2rem",
          }}
        >
          <Image
            src={theme === "dark" ? logoWhite : logoBlack}
            alt="Mhistree"
            height={54}
            style={{
              height: 54,
              width: "auto",
              objectFit: "contain",
              marginBottom: "1rem",
            }}
            priority
          />
          <span
            style={{
              fontSize: "0.9rem",
              opacity: 0.7,
              textAlign: "center",
            }}
          >
            {mode === "signin"
              ? "Welcome back to your Patient Health Portal"
              : "Create your secure Mhistree Patient Account"}
          </span>
        </div>

        {/* Tab Switcher */}
        <div
          className="authseg"
          role="tablist"
          aria-label="Authentication mode"
          style={{ marginBottom: "1.75rem" }}
        >
          <motion.span
            className="authseg-thumb"
            animate={{ x: mode === "signin" ? "0%" : "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
          />
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signin"}
            className={mode === "signin" ? "on" : ""}
            onClick={() => {
              setMode("signin");
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signup"}
            className={mode === "signup" ? "on" : ""}
            onClick={() => {
              setMode("signup");
              setErrorMsg(null);
              setSuccessMsg(null);
            }}
          >
            Sign Up
          </button>
        </div>

        {/* Feedback Alerts */}
        {errorMsg && (
          <div
            style={{
              padding: "12px",
              borderRadius: "10px",
              background: "rgba(239, 68, 68, 0.15)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#fca5a5",
              fontSize: "0.85rem",
              marginBottom: "1.25rem",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <Icon n="alert" s={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div
            style={{
              padding: "12px",
              borderRadius: "10px",
              background: "rgba(34, 197, 94, 0.15)",
              border: "1px solid rgba(34, 197, 94, 0.3)",
              color: "#86efac",
              fontSize: "0.85rem",
              marginBottom: "1.25rem",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <Icon n="check" s={16} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Form Inputs */}
        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "14px" }}
        >
          {mode === "signup" && (
            <div style={{ display: "flex", gap: "10px" }}>
              <div style={{ flex: 1 }}>
                <label
                  style={{
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    opacity: 0.8,
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  First Name
                </label>

                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Jane"
                  className="cinput"
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label
                  style={{
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    opacity: 0.8,
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Last Name
                </label>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Doe"
                  className="cinput"
                  style={{ width: "100%" }}
                />
              </div>
            </div>
          )}

          <div>
            <label
              style={{
                fontSize: "0.8rem",
                fontWeight: 600,
                opacity: 0.8,
                display: "block",
                marginBottom: 4,
              }}
            >
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="patient@example.com"
              className="cinput"
              style={{ width: "100%" }}
            />
          </div>

          <div>
            <label
              style={{
                fontSize: "0.8rem",
                fontWeight: 600,
                opacity: 0.8,
                display: "block",
                marginBottom: 4,
              }}
            >
              Password
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showPw ? "text" : "password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="cinput"
                autoComplete={
                  mode === "signin" ? "current-password" : "new-password"
                }
                style={{ width: "100%", paddingRight: "48px" }}
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? "Hide password" : "Show password"}
                aria-pressed={showPw}
                style={{
                  position: "absolute",
                  right: "4px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "10px",
                  background: "none",
                  border: "none",
                  borderRadius: "10px",
                  color: "var(--ink2)",
                  cursor: "pointer",
                }}
              >
                <Icon n={showPw ? "eyeoff" : "eye"} s={17} />
              </button>
            </div>
          </div>

          <Btn
            kind="dark"
            type="submit"
            disabled={loading}
            style={{
              marginTop: "8px",
              width: "100%",
              justifyContent: "center",
              padding: "12px",
              fontWeight: 600,
            }}
          >
            {loading
              ? "Processing..."
              : mode === "signin"
                ? "Sign In to Mhistree"
                : "Create Account"}
          </Btn>
        </form>

        {/* Back to Chat Option */}
        <div style={{ marginTop: "1.5rem", textAlign: "center" }}>
          <button
            type="button"
            onClick={() => router.push("/chat")}
            style={{
              background: "none",
              border: "none",
              color: "var(--ink2)",
              fontSize: "0.85rem",
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            ← Continue chatting as Guest
          </button>
        </div>
      </div>
    </div>
  );
}
