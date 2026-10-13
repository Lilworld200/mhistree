"use client";

import { useRouter } from "next/navigation";
import Image from "next/image";
import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast-store";
import { useShellStore } from "../store";

import logoBlack from "@/app/assets/images/logos/mhistree_black_logo.png";
import logoWhite from "@/app/assets/images/logos/mhistree_white_logo.png";

export function ClinicianNavContent({ onClose }: { onClose?: () => void }) {
  const router = useRouter();
  const theme = useShellStore((s) => s.theme);
  const go = (href: string) => {
    onClose?.();
    router.push(href);
  };

  return (
    <>
      <div className="brand">
        <Image
          src={theme === "dark" ? logoWhite : logoBlack}
          alt="Mhistree"
          height={60}
          style={{ height: 60, width: 175, objectFit: "contain" }}
          priority
        />
        <span>
          <b className="clinlab">Clinical</b>
        </span>
        {onClose && (
          <button className="dx" onClick={onClose} aria-label="Close menu">
            <Icon n="x" s={16} />
          </button>
        )}
      </div>

      <div className="nav-body">
        {[
          {
            href: "/clinician/dashboard",
            icon: "pulse" as const,
            label: "Dashboard",
          },
          {
            href: "/clinician/patients",
            icon: "user" as const,
            label: "Patients",
          },
        ].map((nv) => (
          <button
            key={nv.href}
            className="nav-item"
            onClick={() => go(nv.href)}
          >
            <Icon n={nv.icon} s={17} />
            {nv.label}
          </button>
        ))}

        <button
          className="nav-item"
          onClick={() => {
            onClose?.();
            toast("No pending clinical alerts", "check");
          }}
        >
          <Icon n="alert" s={17} />
          Alerts
        </button>

        <div className="mlabel" style={{ margin: "14px 14px 6px" }}>
          ACTIVE LEASES
        </div>
        <div
          className="glabel"
          style={{ padding: "4px 14px", fontStyle: "italic", opacity: 0.7 }}
        >
          No active patient access lease
        </div>
      </div>

      <div className="sidefoot">
        <button className="nav-item" onClick={() => go("/chat")}>
          <Icon n="out" s={17} />
          Back to patient app
        </button>
        <button
          className="nav-item"
          onClick={() => toast("Support: clinical@mhistree.app", "chat")}
        >
          <Icon n="chat" s={17} />
          Help
        </button>
        <div className="prow">
          <Avatar ring="#F4A8AC" size={36} name="C" />
          <div className="pmeta">
            <b>Clinician Portal</b>
            <span>General Practice</span>
          </div>
        </div>
      </div>
    </>
  );
}
