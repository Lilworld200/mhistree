"use client";

import { useRouter } from "next/navigation";
import { Btn } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { MiniRow, RowIcon } from "@/components/ui/fact-row";
import { Label } from "@/components/ui/label";
import { Reveal } from "@/components/ui/reveal";
import { useTimelineStore } from "@/features/timeline/store";

export function DashboardView() {
  return (
    <div className="scroll">
      <div className="phead">
        <div>
          <h1 className="ptitle">Good evening, Dr. Okafor</h1>
          <p className="psub">What needs your attention?</p>
        </div>
        <span className="hpill hpill-dark">
          <Icon n="clock" s={13} />
          3 consultations today
        </span>
      </div>

      <div className="grid3">
        <Reveal>
          <AlertsCard />
        </Reveal>
        <Reveal d={0.06}>
          <VerificationSummaryCard />
        </Reveal>
        <Reveal d={0.12}>
          <UpcomingCard />
        </Reveal>
      </div>
    </div>
  );
}

function AlertsCard() {
  const router = useRouter();
  const open = () => router.push("/clinician/patients/p1");
  return (
    <div className="card">
      <Label
        right={
          <span className="badge" style={{ color: "var(--red)" }}>
            <i className="badge-dot" style={{ background: "var(--red)" }} />
            Urgent
          </span>
        }
      >
        Alerts
      </Label>
      <MiniRow onClick={open}>
        <RowIcon icon="pulse" color="#8A63D2" bg="#8A63D222" sm />
        <span>
          <b>Nati · HR 118 bpm at rest</b>
          <span className="small block">Device reading · 19 Aug, post-episode</span>
        </span>
      </MiniRow>
      <MiniRow onClick={open}>
        <RowIcon icon="spark" color="#C08A2D" bg="#C08A2D22" sm />
        <span>
          <b>AI hypothesis awaiting review</b>
          <span className="small block">Possible exercise-induced asthma</span>
        </span>
      </MiniRow>
    </div>
  );
}

function VerificationSummaryCard() {
  const router = useRouter();
  const need = useTimelineStore(
    (s) => s.events.filter((e) => e.status === "reported" || e.status === "inferred").length,
  );
  return (
    <div className="card">
      <Label
        right={
          <span className="badge">
            {need} pending
          </span>
        }
      >
        Needs verification
      </Label>
      <p className="small">
        Patient-reported events and AI inferences require your clinical authority
        before entering the verified ledger.
      </p>
      <Btn kind="dark" sm icon="check" onClick={() => router.push("/clinician/patients/p1")}>
        Review queue
      </Btn>
    </div>
  );
}

function UpcomingCard() {
  return (
    <div className="card">
      <Label>Upcoming</Label>
      <MiniRow>
        <RowIcon icon="cal" color="#181818" bg="#18181814" sm />
        <span>
          <b>Nati Adeyemi</b>
          <span className="small block">28 Aug · Spirometry</span>
        </span>
      </MiniRow>
      <MiniRow>
        <RowIcon icon="cal" color="#181818" bg="#18181814" sm />
        <span>
          <b>Musa Ibrahim</b>
          <span className="small block">29 Aug · Follow-up (no lease yet)</span>
        </span>
      </MiniRow>
    </div>
  );
}
