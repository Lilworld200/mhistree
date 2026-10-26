"use client";
import type { MouseEventHandler } from "react";
import { Icon, type IconName } from "@/components/ui/icons";
/** Compact glass action for patient-profile tools, with a full accessible name. */
export function PatientActionButton({
  icon,
  label,
  mobileLabel,
  onClick,
  hasNotification,
}: {
  icon: IconName;
  label: string;
  mobileLabel?: string;
  onClick: MouseEventHandler<HTMLButtonElement>;
  hasNotification?: boolean;
}) {
  return (
    <button
      type="button"
      className="patient-icon-action"
      aria-label={hasNotification ? `${label} (new update)` : label}
      onClick={onClick}
      style={{ position: "relative" }}
    >
      <span className="patient-action-icon" style={{ position: "relative" }}>
        <Icon n={icon} s={19} />
        {hasNotification && (
          <span
            className="badge-dot"
            style={{
              position: "absolute",
              top: "-2px",
              right: "-2px",
              background: "#1684ed",
              width: "7px",
              height: "7px",
              borderRadius: "50%",
            }}
            aria-hidden="true"
          />
        )}
      </span>
      <span className="patient-action-desktop-label">{label}</span>
      <span className="patient-action-mobile-label">
        {mobileLabel ?? label}
      </span>
    </button>
  );
}
