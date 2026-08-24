"use client";

import * as Tabs from "@radix-ui/react-tabs";
import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { Btn } from "@/components/ui/button";
import { KvRow, MiniRow } from "@/components/ui/fact-row";
import { Icon } from "@/components/ui/icons";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/toast-store";
import { downloadJson } from "@/lib/utils/download";
import { useDocumentsStore } from "@/features/documents/store";
import { useTimelineStore } from "@/features/timeline/store";
import { useShellStore } from "@/features/shell/store";
import { useSettingsStore } from "../store";

const TABS = [
  { id: "Account", label: "Account", icon: "user" as const },
  { id: "Conversation", label: "Conversation", icon: "chat" as const },
  { id: "Notifications", label: "Notifications", icon: "alert" as const },
  { id: "Privacy", label: "Privacy", icon: "lock" as const },
  { id: "Security", label: "Security", icon: "shield" as const },
  { id: "Data & History", label: "Data & History", icon: "doc" as const },
  { id: "Appearance", label: "Appearance", icon: "spark" as const },
  { id: "Help", label: "Help", icon: "steth" as const },
];

export function SettingsView() {
  return (
    <div className="scroll setcontainer">
      <Tabs.Root defaultValue="Account" className="setlayout">
        <Tabs.List className="settabs" aria-label="Settings sections">
          {TABS.map((t) => (
            <Tabs.Trigger key={t.id} value={t.id} className="settab">
              <Icon n={t.icon} s={16} />
              <span>{t.label}</span>
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <div className="setbody">
          {TABS.map((t) => (
            <Tabs.Content key={t.id} value={t.id}>
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
              >
                <Panel tab={t.id} />
              </motion.div>
            </Tabs.Content>
          ))}
        </div>
      </Tabs.Root>
    </div>
  );
}

function Panel({ tab }: { tab: string }) {
  const router = useRouter();
  const prefs = useSettingsStore((s) => s.prefs);
  const setPref = useSettingsStore((s) => s.setPref);
  const theme = useShellStore((s) => s.theme);
  const setTheme = useShellStore((s) => s.setTheme);

  switch (tab) {
    case "Account":
      return (
        <Card
          label="Account"
          footer={
            <Btn
              kind="soft"
              sm
              icon="edit"
              onClick={() =>
                toast("Profile editing arrives with account service", "edit")
              }
            >
              Edit identity
            </Btn>
          }
        >
          <KvRow k="Name" v="Nati Adeyemi" />
          <KvRow k="Email" v="nati@mhistree.app" />
          <KvRow k="Phone" v="+234 802 000 0000" />
          <KvRow k="Preferred name" v="Nati" />
        </Card>
      );

    case "Conversation":
      return (
        <Card label="Conversation">
          <KvRow
            k="Response style"
            v={
              <ChoiceGroup
                value={prefs.style}
                options={["Concise", "Detailed"]}
                onChange={(v) => {
                  setPref("style", v);
                  toast(`Response style: ${v}`, "chat");
                }}
              />
            }
          />
          <KvRow
            k="Language"
            v={
              <ChoiceGroup
                value={prefs.lang}
                options={["English", "Pidgin", "Yoruba", "Hausa"]}
                onChange={(v) => setPref("lang", v)}
              />
            }
          />
          <KvRow
            k="Voice replies"
            v={
              <Switch
                on={prefs.voice}
                onChange={(v) => setPref("voice", v)}
                label="Voice replies"
              />
            }
          />
        </Card>
      );

    case "Notifications":
      return (
        <Card label="Notifications">
          <KvRow
            k="Reminders"
            v={
              <Switch
                on={prefs.reminders}
                onChange={(v) => setPref("reminders", v)}
                label="Reminders"
              />
            }
          />
          <KvRow
            k="Appointments"
            v={
              <Switch
                on={prefs.notif}
                onChange={(v) => setPref("notif", v)}
                label="Appointment notifications"
              />
            }
          />
          <KvRow
            k="Sharing / access alerts"
            v={
              <Switch
                on={prefs.shareAlerts}
                onChange={(v) => setPref("shareAlerts", v)}
                label="Sharing alerts"
              />
            }
          />
        </Card>
      );

    case "Privacy":
      return (
        <Card
          label="Privacy"
          footer={
            <Btn
              kind="soft"
              sm
              icon="shield"
              onClick={() => router.push("/sharing")}
            >
              Access history
            </Btn>
          }
        >
          <KvRow
            k="Personal memory (private)"
            v={
              <Switch
                on={prefs.personalMem}
                onChange={(v) => {
                  setPref("personalMem", v);
                  toast(
                    v ? "Personal memory on" : "Personal memory paused",
                    "lock",
                  );
                }}
                label="Personal memory"
              />
            }
          />
          <KvRow
            k="Health memory (shareable)"
            v={
              <Switch
                on={prefs.healthMem}
                onChange={(v) => setPref("healthMem", v)}
                label="Health memory"
              />
            }
          />
        </Card>
      );

    case "Security":
      return (
        <Card
          label="Security"
          footer={
            <Btn
              kind="soft"
              sm
              icon="lock"
              onClick={() => toast("Password reset link sent", "lock")}
            >
              Change password
            </Btn>
          }
        >
          <KvRow k="This device · Lagos NG" v="Active now" />
          <KvRow
            k="Web · Chrome"
            v={
              <button
                className="link"
                onClick={() => toast("Session signed out", "out")}
              >
                Sign out
              </button>
            }
          />
        </Card>
      );

    case "Data & History":
      return (
        <Card label="Data & History">
          <p className="small">
            Raw chats, embeddings and media follow retention policy. Derived
            summaries always point back to source evidence.
          </p>
          <div className="actrow">
            <Btn
              kind="dark"
              sm
              icon="download"
              onClick={() => {
                const s = useTimelineStore.getState();
                downloadJson("mhistree-health-history.json", {
                  profile: "Nati Adeyemi",
                  events: s.events,
                  documents: useDocumentsStore
                    .getState()
                    .documents.map((d) => d.name),
                });
                toast("Health history exported", "download");
              }}
            >
              Download health history
            </Btn>
            <Btn
              kind="soft"
              sm
              icon="edit"
              onClick={() =>
                toast("Correction requests reviewed within 72h", "edit")
              }
            >
              Correction requests
            </Btn>
            <Btn
              kind="soft"
              sm
              icon="x"
              onClick={() =>
                toast("Deletion request logged for review", "alert")
              }
            >
              Request deletion
            </Btn>
          </div>
        </Card>
      );

    case "Appearance":
      return (
        <Card label="Appearance">
          <KvRow
            k="Theme"
            v={
              <ChoiceGroup
                value={theme}
                options={["light", "dark"]}
                capitalize
                onChange={(v) => setTheme(v as "light" | "dark")}
              />
            }
          />
          <p className="small">
            Soft-float surface system · one saturated hero · one dark primary
            action.
          </p>
        </Card>
      );

    default:
      return (
        <Card
          label="Help"
          footer={
            <Btn
              kind="soft"
              sm
              icon="chat"
              onClick={() => router.push("/chat")}
            >
              Talk to Mhistree
            </Btn>
          }
        >
          <MiniRow>
            <Icon n="spark" s={16} c="#478BEE" />
            <span className="small">
              What can Mhistree remember? Only what you share or upload — always
              with provenance.
            </span>
          </MiniRow>
          <MiniRow>
            <Icon n="shield" s={16} c="#2F8F5B" />
            <span className="small">
              Who sees my diary? Nobody. Personal Context is architecturally
              excluded from clinician access.
            </span>
          </MiniRow>
        </Card>
      );
  }
}

function Card({
  label,
  children,
  footer,
}: {
  label: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <motion.div className="card" layout={false}>
      <Label>{label}</Label>
      {children}
      {footer && <div className="actrow">{footer}</div>}
    </motion.div>
  );
}

function ChoiceGroup({
  value,
  options,
  onChange,
  capitalize,
}: {
  value: string;
  options: readonly string[];
  onChange: (v: string) => void;
  capitalize?: boolean;
}) {
  return (
    <ToggleGroup.Root
      type="single"
      className="pills"
      value={value}
      onValueChange={(v) => v && onChange(v)}
    >
      {options.map((o) => (
        <ToggleGroup.Item key={o} value={o} className="pill pill-tiny">
          {capitalize ? o.charAt(0).toUpperCase() + o.slice(1) : o}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
