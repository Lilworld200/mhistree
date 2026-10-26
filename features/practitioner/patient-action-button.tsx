"use client";
import type { MouseEventHandler } from "react";
import { Icon, type IconName } from "@/components/ui/icons";
/** Compact glass action for patient-profile tools, with a full accessible name. */
export function PatientActionButton({
  icon,
  label,
  mobileLabel,
  onClick,
}: {
  icon: IconName;
  label: string;
  mobileLabel?: string;
  onClick: MouseEventHandler<HTMLButtonElement>;
}) {
  return (
    <button
      type="button"
      className="patient-icon-action"
      aria-label={label}
      onClick={onClick}
    >
      <span className="patient-action-icon">
        <Icon n={icon} s={19} />
      </span>
      <span className="patient-action-desktop-label">{label}</span>
      <span className="patient-action-mobile-label">
        {mobileLabel ?? label}
      </span>
    </button>
  );
}
