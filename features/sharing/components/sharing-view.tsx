"use client";

import { Btn } from "@/components/ui/button";
import { AccessHistoryCard } from "./access-history-card";
import { LeaseCard } from "./lease-card";
import { useSharingStore } from "../store";

export function SharingView() {
  const leases = useSharingStore((s) => s.leases);
  const setWizardOpen = useSharingStore((s) => s.setWizardOpen);

  return (
    <div className="scroll">
      <div className="phead">
        <div>
          <h1 className="ptitle">Health Access</h1>
          <p className="psub">
            You decide who sees your Health Context — and for how long
          </p>
        </div>
        <Btn kind="dark" icon="plus" onClick={() => setWizardOpen(true)}>
          Share health information
        </Btn>
      </div>
      <div className="grid2">
        {leases.map((l, i) => (
          <LeaseCard key={l.id} lease={l} index={i} />
        ))}
        <AccessHistoryCard />
      </div>
    </div>
  );
}
