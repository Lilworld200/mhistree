"use client";

import React from "react";
import { OverlayShell } from "@/components/ui/overlay-shell";
import { Btn, IconBtn } from "@/components/ui/button";
import type { IconName } from "@/components/ui/icons";

export interface PromptAction {
  label: string;
  onClick?: () => void;
  icon?: IconName;
  kind?: "dark" | "soft";
}

export interface PromptDialogProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the dialog; rendered as the visible heading. */
  title: string;
  description?: React.ReactNode;
  /** Full-width primary action (dark button). */
  primary?: PromptAction;
  /** Optional second action (soft button). */
  secondary?: PromptAction;
  /** Optional link-style dismiss under the buttons (e.g. "Not now"). */
  dismissLabel?: string;
  width?: number;
}

/**
 * Reusable prompt/confirm popup: pass text + actions, get an accessible
 * centered dialog with the app's floating-card overlay design
 * (blurred scrim, spring scale-in, focus trap, Escape, scroll lock).
 */
export function PromptDialog({
  open,
  onClose,
  title,
  description,
  primary,
  secondary,
  dismissLabel,
  width = 420,
}: PromptDialogProps) {
  return (
    <OverlayShell open={open} onClose={onClose} variant="center" width={width} title={title}>
      <div className="prompt-x">
        <IconBtn ghost icon="x" size={36} title="Close" onClick={onClose} />
      </div>

      <div className="prompt-body">
        <h2 className="ptitle-sm">{title}</h2>
        {description ? <p className="small">{description}</p> : null}
      </div>

      {(primary || secondary) && (
        <div className="prompt-actions">
          {primary && (
            <Btn
              kind={primary.kind ?? "dark"}
              icon={primary.icon}
              style={{ width: "100%" }}
              onClick={() => {
                primary.onClick?.();
              }}
            >
              {primary.label}
            </Btn>
          )}
          {secondary && (
            <Btn
              kind={secondary.kind ?? "soft"}
              icon={secondary.icon}
              style={{ width: "100%" }}
              onClick={() => {
                secondary.onClick?.();
              }}
            >
              {secondary.label}
            </Btn>
          )}
        </div>
      )}

      {dismissLabel && (
        <button type="button" className="link prompt-dismiss" onClick={onClose}>
          {dismissLabel}
        </button>
      )}
    </OverlayShell>
  );
}
