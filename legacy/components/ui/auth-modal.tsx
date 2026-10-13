"use client";

import { useRouter } from "next/navigation";
import { PromptDialog } from "@/components/ui/prompt-dialog";

interface AuthModalProps {
  open: boolean;
  onClose?: () => void;
  title?: string;
  description?: string;
}

/**
 * Auth-gate popup built on the reusable PromptDialog.
 * Primary action goes to the auth page; dismissing returns to chat.
 */
export function AuthModal({
  open,
  onClose,
  title = "Authentication Required",
  description = "Please sign in or create an account to access your medical records, health profile, and document sharing.",
}: AuthModalProps) {
  const router = useRouter();

  const dismissToChat = () => {
    onClose?.();
    router.push("/chat");
  };

  const goToAuth = () => {
    onClose?.();
    router.push("/auth");
  };

  return (
    <PromptDialog
      open={open}
      onClose={dismissToChat}
      title={title}
      description={description}
      primary={{
        label: "Sign In / Create Account",
        icon: "user",
        onClick: goToAuth,
      }}
      width={460}
    />
  );
}
