"use client";

import { Btn } from "@/components/ui/button";
import { KvRow } from "@/components/ui/fact-row";
import { Countdown } from "@/components/ui/countdown";
import { Icon } from "@/components/ui/icons";
import { Label, MicroLabel } from "@/components/ui/label";
import { OverlayHead, OverlayShell } from "@/components/ui/overlay-shell";
import { QrCode } from "@/components/ui/qr-code";
import { useSharingStore } from "../store";
import { ScopeChips } from "./lease-card";

export function LeaseDrawer() {
  const leaseViewId = useSharingStore((s) => s.leaseViewId);
  const setLeaseViewId = useSharingStore((s) => s.setLeaseViewId);
  const revokeLease = useSharingStore((s) => s.revokeLease);
  const lease = useSharingStore((s) =>
    s.leaseViewId ? s.leases.find((l) => l.id === s.leaseViewId) : undefined,
  );
  const close = () => setLeaseViewId(null);

  return (
    <OverlayShell
      open={!!leaseViewId}
      onClose={close}
      title={lease ? `Access lease ${lease.id}` : "Access lease"}
    >
      {lease && (
        <>
          <OverlayHead
            title={<b className="ptitle-sm">Access lease {lease.id}</b>}
            onClose={close}
          />
          <div className="scroll" style={{ padding: "0 22px 22px" }}>
            <div className="qrwrap">
              <QrCode seed={lease.code} />
              <div>
                <MicroLabel>OTP CODE</MicroLabel>
                <b className="otp">{lease.code}</b>
                <p className="small">
                  Scoped to Health Context. Personal diary excluded by architecture.
                </p>
              </div>
            </div>

            <KvRow k="Holder" v={`${lease.actor} · ${lease.org}`} />
            <KvRow k="Purpose" v={lease.purpose} />
            <KvRow
              k="Status"
              v={
                lease.status === "active" ? (
                  <Countdown exp={lease.expiresAt} />
                ) : (
                  lease.status
                )
              }
            />

            <Label>Scope</Label>
            <ScopeChips scope={lease.scope} />
            <span className="pill pill-tiny" style={{ color: "var(--red)", marginTop: 4 }}>
              <Icon n="lock" s={11} />
              Personal context
            </span>

            {lease.status === "active" && (
              <Btn
                kind="dark"
                icon="lock"
                style={{ width: "100%", marginTop: 16 }}
                onClick={() => revokeLease(lease.id)}
              >
                Revoke access now
              </Btn>
            )}
          </div>
        </>
      )}
    </OverlayShell>
  );
}
