"use client";

import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Icon, Logo } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast-store";
import { AVATARS, CLINICIAN } from "@/lib/demo/people";

export function ClinicianNavContent({ onClose }: { onClose?: () => void }) {
  const router = useRouter();
  const go = (href: string) => {
    onClose?.();
    router.push(href);
  };

  return (
    <>
      <div className="brand">
        <Logo />
        <span>
          Mhistree
          <b className="clinlab">Clinical</b>
        </span>
        {onClose && (
          <button className="dx" onClick={onClose} aria-label="Close menu">
            <Icon n="x" s={16} />
          </button>
        )}
      </div>

      {[
        { href: "/clinician/dashboard", icon: "pulse" as const, label: "Dashboard" },
        { href: "/clinician/patients", icon: "user" as const, label: "Patients" },
      ].map((nv) => (
        <button key={nv.href} className="nav-item" onClick={() => go(nv.href)}>
          <Icon n={nv.icon} s={17} />
          {nv.label}
        </button>
      ))}

      <button
        className="nav-item"
        onClick={() => {
          onClose?.();
          toast("2 alerts need review", "alert");
        }}
      >
        <Icon n="alert" s={17} />
        Alerts
        <span className="nav-badge">2</span>
      </button>

      <div className="mlabel" style={{ margin: "14px 14px 6px" }}>
        ACTIVE LEASES
      </div>
      <button
        className="nav-item on"
        onClick={() => go("/clinician/patients/p1")}
      >
        <Avatar img={AVATARS.nati} ring="#F4A8AC" size={24} name="N" />
        <span className="ell">Nati Adeyemi</span>
      </button>

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
          <Avatar img={AVATARS.amara} ring="#F4A8AC" size={36} name="A" />
          <div className="pmeta">
            <b>{CLINICIAN.name}</b>
            <span>{CLINICIAN.role}</span>
          </div>
        </div>
      </div>
    </>
  );
}
