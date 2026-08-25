"use client";

import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icons";
import { Btn } from "@/components/ui/button";

interface AuthModalProps {
  open: boolean;
  onClose?: () => void;
  title?: string;
  description?: string;
}

export function AuthModal({
  open,
  onClose,
  title = "Authentication Required",
  description = "Please sign in or create an account to access your medical records, health profile, and document sharing.",
}: AuthModalProps) {
  const router = useRouter();

  if (!open) return null;

  const handleReturnToChat = () => {
    if (onClose) onClose();
    router.push("/chat");
  };

  const handleGoToAuth = () => {
    if (onClose) onClose();
    router.push("/auth");
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        backgroundColor: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      <div
        className="card"
        style={{
          position: "relative",
          maxWidth: "460px",
          width: "100%",
          padding: "2rem",
          background: "var(--color-bg-elevated, #171c26)",
          border: "1px solid var(--color-border, rgba(255,255,255,0.12))",
          borderRadius: "16px",
          boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
          color: "var(--color-fg, #f1f5f9)",
        }}
      >
        {/* Top Header X Icon */}
        <button
          onClick={handleReturnToChat}
          style={{
            position: "absolute",
            top: "1.25rem",
            right: "1.25rem",
            background: "none",
            border: "none",
            color: "rgba(255, 255, 255, 0.6)",
            cursor: "pointer",
            padding: "6px",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "all 0.2s ease",
          }}
          title="Close and return to chat"
          aria-label="Close prompt"
        >
          <Icon n="x" s={20} />
        </button>

        {/* Modal Icon Header */}
        <div
          style={{
            marginBottom: "1.25rem",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "12px",
              background: "rgba(244, 168, 172, 0.15)",
              border: "1px solid rgba(244, 168, 172, 0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#F4A8AC",
            }}
          >
            <Icon n="lock" s={24} />
          </div>
          <div>
            <h3 style={{ fontSize: "1.25rem", fontWeight: 600, margin: 0 }}>
              {title}
            </h3>
            <span style={{ fontSize: "0.85rem", opacity: 0.7 }}>
              Mhistree Patient Portal
            </span>
          </div>
        </div>

        {/* Modal Body */}
        <p
          style={{
            fontSize: "0.95rem",
            lineHeight: 1.6,
            opacity: 0.85,
            marginBottom: "1.75rem",
          }}
        >
          {description}
        </p>

        {/* Action Buttons */}
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          <Btn
            kind="dark"
            style={{ width: "100%", justifyContent: "center", padding: "12px" }}
            onClick={handleGoToAuth}
          >
            Sign In / Create Account
          </Btn>
          <Btn
            kind="soft"
            style={{ width: "100%", justifyContent: "center", opacity: 0.8 }}
            onClick={handleReturnToChat}
          >
            Return to AI Chat
          </Btn>
        </div>
      </div>
    </div>
  );
}
