"use client";
import { useRef, useState } from "react";
import { Btn } from "@/components/ui/button";
import { SidePanel } from "@/components/ui/side-panel";
import { api, errorMessage } from "@/lib/client-api";
import { category } from "@/features/health-records/schema";
import { categoryLabels } from "./sharing-types";
type Settings = { enabled: boolean; categories: string[]; version: number };
export function ConnectionApprovalSettings({
  role,
}: {
  role: "patient" | "practitioner";
}) {
  const [open, setOpen] = useState(false),
    [settings, setSettings] = useState<Settings | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const trigger = useRef<HTMLElement | null>(null),
    pending = useRef(false);
  async function load() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      setSettings(await api<Settings>(`/api/connection-settings?role=${role}`));
    } catch (e) {
      setSettings(null);
      setError(errorMessage(e));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  async function toggle(enabled: boolean) {
    if (!settings || pending.current || error) return;
    const prior = settings;
    pending.current = true;
    setBusy(true);
    setStatus("Saving...");
    setSettings({ ...prior, enabled });
    try {
      const result = await api<Settings>("/api/connection-settings", {
        role,
        enabled,
        version: prior.version,
        ...(role === "patient"
          ? {
              categories: prior.categories.length
                ? prior.categories
                : category.options,
            }
          : {}),
      });
      setSettings(result);
      setStatus("Saved automatically.");
    } catch (e) {
      setSettings(prior);
      setStatus("");
      setError(errorMessage(e));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  const limitedScope =
    settings?.categories.length &&
    settings.categories.length < category.options.length;
  return (
    <>
      <Btn
        onClick={(event) => {
          trigger.current = event.currentTarget;
          setOpen(true);
          void load();
        }}
      >
        Connection approvals
      </Btn>
      {open && (
        <SidePanel
          title="Connection approvals"
          description={
            role === "patient"
              ? "Choose how incoming practitioner requests are approved."
              : "Choose how incoming patient requests are approved."
          }
          onClose={() => {
            if (!pending.current) setOpen(false);
          }}
          returnFocus={() => trigger.current}
        >
          <div
            className="sharing-panel-body approval-settings-body"
            aria-busy={busy}
          >
            {busy && !settings && <p role="status">Loading settings...</p>}
            {settings && (
              <>
                <p className="sharing-help" id={`approval-explanation-${role}`}>
                  {role === "patient"
                    ? "When enabled, approved practitioners with your Mhistree ID can connect automatically and access your finalized health records within your sharing scope. Private notes and drafts stay private."
                    : "When enabled, connection requests sent by patients are accepted automatically. Otherwise, you approve each request in My patients."}
                </p>
                {role === "patient" && Boolean(limitedScope) && (
                  <p className="sharing-help">
                    Your scope:{" "}
                    {settings.categories
                      .map((value) => categoryLabels[value] ?? value)
                      .join(", ")}
                    . Broader requests still need your approval.
                  </p>
                )}
                <label className="approval-setting-toggle">
                  <span>
                    Automatically approve{" "}
                    {role === "patient" ? "practitioner" : "patient"} requests
                  </span>
                  <input
                    type="checkbox"
                    role="switch"
                    checked={settings.enabled}
                    disabled={busy || Boolean(error)}
                    aria-describedby={`approval-explanation-${role}`}
                    onChange={(event) => void toggle(event.target.checked)}
                  />
                </label>
                <p className="sharing-help">
                  Changes save automatically and apply to new requests. Existing
                  connections stay as they are.
                </p>
                <p role="status" className="approval-setting-status">
                  {status}
                </p>
              </>
            )}
            {error && (
              <div role="alert">
                <p>{error}</p>
                <Btn disabled={busy} onClick={() => void load()}>
                  Reload settings
                </Btn>
              </div>
            )}
          </div>
        </SidePanel>
      )}
    </>
  );
}
