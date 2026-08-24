"use client";

import { useEffect } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Countdown } from "@/components/ui/countdown";
import { ProvBadge } from "@/components/ui/badge";
import { Reveal } from "@/components/ui/reveal";
import { Icon } from "@/components/ui/icons";
import { AVATARS, PATIENT } from "@/lib/demo/people";
import { useSharingStore } from "@/features/sharing/store";
import { ClinicalBriefingCard } from "./clinical-briefing-card";
import { RecordTabsCard } from "./record-tabs-card";
import { ActionConsole } from "./action-console";
import { MobileClinicalToolbar } from "./mobile-clinical-toolbar";

/* Audit-log dedupe: log a patient record opening at most once per minute. */
const lastLogged = new Map<string, number>();

export function PatientRecordView({ patientId }: { patientId: string }) {
  const lease = useSharingStore((s) => s.leases.find((l) => l.status === "active"));
  const logAccess = useSharingStore((s) => s.logAccess);

  const authorized = patientId === "p1" && !!lease && lease.status === "active";

  useEffect(() => {
    if (!authorized) return;
    const last = lastLogged.get(patientId) ?? 0;
    if (Date.now() - last > 60_000) {
      lastLogged.set(patientId, Date.now());
      logAccess("Dr. Amara Okafor", `Opened patient record · ${PATIENT.name}`);
    }
  }, [patientId, authorized, logAccess]);

  if (!authorized) {
    return (
      <div className="scroll">
        <div
          className="card card-inset"
          style={{ padding: 40, textAlign: "center" }}
        >
          <span style={{ display: "grid", placeItems: "center", margin: "0 auto", width: 28 }}>
            <Icon n="lock" s={28} />
          </span>
          <h2 className="ptitle-sm" style={{ margin: "12px 0 6px" }}>
            No active lease
          </h2>
          <p className="small">
            Ask the patient to generate an access lease from their app.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="scroll">
      <Reveal>
        <div className="card pheader">
          <Avatar img={AVATARS.nati} ring="#F4A8AC" size={54} name="N" />
          <div style={{ flex: 1 }}>
            <b className="ptitle-sm">{PATIENT.name}</b>
            <span className="small block">
              24 · O+ · AS · Allergy: Penicillin (verified) · Med: Salbutamol PRN
            </span>
            <span className="evbadges" style={{ marginTop: 6 }}>
              <ProvBadge src="clinician" />
              <ProvBadge src="ai" />
            </span>
          </div>
          <div className="leasepill">
            <Icon n="shield" s={14} />
            <Countdown exp={lease.expiresAt} prefix="Lease · " />
          </div>
        </div>
      </Reveal>

      <div className="cgrid">
        <Reveal d={0.05}>
          <ClinicalBriefingCard />
        </Reveal>
        <Reveal d={0.1}>
          <RecordTabsCard />
        </Reveal>
        <Reveal d={0.15}>
          <ActionConsole />
        </Reveal>
      </div>

      <MobileClinicalToolbar />
    </div>
  );
}
