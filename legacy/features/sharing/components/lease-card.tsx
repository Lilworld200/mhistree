"use client";

import { Avatar } from "@/components/ui/avatar";
import { Btn } from "@/components/ui/button";
import { Countdown } from "@/components/ui/countdown";
import { Reveal } from "@/components/ui/reveal";
import type { Lease } from "../types";
import { useSharingStore } from "../store";

export function LeaseCard({ lease, index }: { lease: Lease; index: number }) {
  const setLeaseViewId = useSharingStore((s) => s.setLeaseViewId);
  const revokeLease = useSharingStore((s) => s.revokeLease);

  return (
    <Reveal d={index * 0.06}>
      <div className="card">
        <div className="leasetop">
          <Avatar img={lease.img} ring="#B7E4C7" size={44} name={lease.actor} />
          <div>
            <b>{lease.actor}</b>
            <span className="small block">{lease.org}</span>
          </div>
          <span
            className="badge"
            style={{ color: lease.status === "active" ? "var(--green)" : "var(--red)" }}
          >
            <i
              className="badge-dot"
              style={{
                background: lease.status === "active" ? "var(--green)" : "var(--red)",
              }}
            />
            {lease.status.charAt(0).toUpperCase() + lease.status.slice(1)}
          </span>
        </div>
        <div className="kv"><span>Purpose</span><b>{lease.purpose}</b></div>
        <div className="kv"><span>Access</span><b>Health Context only</b></div>
        <div className="kv">
          <span>Window</span>
          <b>
            {lease.status === "active" ? (
              <Countdown exp={lease.expiresAt} />
            ) : (
              lease.status
            )}
          </b>
        </div>
        <ScopeChips scope={lease.scope} muted />
        <div className="actrow" style={{ marginTop: 14 }}>
          <Btn kind="soft" sm icon="eye" onClick={() => setLeaseViewId(lease.id)}>
            View
          </Btn>
          {lease.status === "active" && (
            <Btn kind="soft" sm icon="lock" onClick={() => revokeLease(lease.id)}>
              Revoke
            </Btn>
          )}
        </div>
      </div>
    </Reveal>
  );
}

export function ScopeChips({ scope, muted }: { scope: string[]; muted?: boolean }) {
  return (
    <div className="qchips">
      {scope.map((sc) => (
        <span key={sc} className={muted ? "pill pill-tiny" : "pill pill-tiny on"}>
          {sc}
        </span>
      ))}
    </div>
  );
}
