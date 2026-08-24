import type { IconName } from "@/components/ui/icons";

export interface NavItem {
  href: string;
  icon: IconName;
  label: string;
}

export const PATIENT_NAV: NavItem[] = [
  { href: "/chat", icon: "chat", label: "AI" },
  { href: "/timeline", icon: "pulse", label: "Timeline" },
  { href: "/health", icon: "heart", label: "Health" },
  { href: "/documents", icon: "doc", label: "Documents" },
  { href: "/sharing", icon: "share", label: "Sharing" },
];

export const SESSION_GROUPS = [
  "Today",
  "Yesterday",
  "Previous 7 days",
  "Previous month",
];

export const PATIENT_TITLES: Record<string, string> = {
  "/chat": "Mhistree",
  "/timeline": "Timeline",
  "/health": "Health",
  "/documents": "Documents",
  "/sharing": "Sharing",
  "/settings": "Settings",
};

export const CLINICIAN_TITLES: Record<string, string> = {
  "/clinician/dashboard": "Dashboard",
  "/clinician/patients": "Patients",
};

/** Identifiers for contextual mobile top-bar actions, resolved per route. */
export type TopBarActionId =
  | "new-chat"
  | "search"
  | "ask-health"
  | "upload"
  | "share"
  | "settings"
  | "back-to-chat"
  | "alerts"
  | "clinical-ai";

export const TOPBAR_ACTIONS: Record<
  string,
  { id: TopBarActionId; icon: IconName; title: string }
> = {
  "/chat": { id: "new-chat", icon: "plus", title: "New chat" },
  "/timeline": { id: "search", icon: "search", title: "Search history" },
  "/health": { id: "ask-health", icon: "spark", title: "Ask Mhistree" },
  "/documents": { id: "upload", icon: "up", title: "Upload document" },
  "/sharing": { id: "share", icon: "plus", title: "Share health information" },
  "/settings": { id: "back-to-chat", icon: "chev", title: "Back to chat" },
  "/clinician/dashboard": { id: "alerts", icon: "bell", title: "Alerts" },
  "/clinician/patients": { id: "search", icon: "search", title: "Search" },
};
