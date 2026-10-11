"use client";

import { useRouter, usePathname } from "next/navigation";
import { IconBtn } from "@/components/ui/button";
import { toast } from "@/components/ui/toast-store";
import { useAiAssistantStore } from "@/features/ai-assistant/store";
import { useChatStore } from "@/features/chat/store";
import { useDocumentsStore } from "@/features/documents/store";
import { useSharingStore } from "@/features/sharing/store";
import {
  CLINICIAN_TITLES,
  PATIENT_TITLES,
  TOPBAR_ACTIONS,
} from "../config/navigation";
import { useShellStore } from "../store";

function titleForPath(pathname: string): string {
  if (PATIENT_TITLES[pathname]) return PATIENT_TITLES[pathname];
  if (CLINICIAN_TITLES[pathname]) return CLINICIAN_TITLES[pathname];
  if (pathname.startsWith("/clinician/patients/")) return "Patient record";
  return "Mhistree";
}

/** Mobile-only sticky top bar: menu · contextual title · page action. */
export function MobileTopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const setDrawerOpen = useShellStore((s) => s.setDrawerOpen);
  const setCmdOpen = useShellStore((s) => s.setCmdOpen);

  const chat = useChatStore.getState;
  const documents = useDocumentsStore.getState;
  const sharing = useSharingStore.getState;
  const aiAssistant = useAiAssistantStore.getState;

  const title = titleForPath(pathname);
  const action =
    TOPBAR_ACTIONS[pathname] ??
    (pathname.startsWith("/clinician/patients/")
      ? { id: "clinical-ai" as const, icon: "spark" as const, title: "Clinical AI" }
      : undefined);

  const runAction = () => {
    if (!action) return;
    switch (action.id) {
      case "new-chat":
        chat().newChat();
        break;
      case "search":
        setCmdOpen(true);
        break;
      case "ask-health":
        aiAssistant().open("health");
        break;
      case "upload":
        documents().upload();
        break;
      case "share":
        sharing().setWizardOpen(true);
        break;
      case "settings":
        router.push("/settings");
        break;
      case "back-to-chat":
        router.push("/chat");
        break;
      case "alerts":
        toast("2 alerts need review", "alert");
        break;
      case "clinical-ai":
        aiAssistant().open("patient");
        break;
    }
  };

  return (
    <div className="topbar">
      <IconBtn
        icon="menu"
        size={40}
        title="Open menu"
        onClick={() => setDrawerOpen(true)}
      />
      <span className="tbtitle">{title}</span>
      {action ? (
        <IconBtn icon={action.icon} size={40} title={action.title} onClick={runAction} />
      ) : (
        <span style={{ width: 40 }} />
      )}
    </div>
  );
}
