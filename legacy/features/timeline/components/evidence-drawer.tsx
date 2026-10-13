"use client";

import { useRouter } from "next/navigation";
import { Btn } from "@/components/ui/button";
import { ProvBadge, STATUS_COLORS, StatusBadge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icons";
import { Label } from "@/components/ui/label";
import { OverlayHead, OverlayShell } from "@/components/ui/overlay-shell";
import { toast } from "@/components/ui/toast-store";
import { useDocumentsStore } from "@/features/documents/store";
import { useChatStore } from "@/features/chat/store";
import { TYPE_META } from "../model";
import type { VerificationStatus } from "../model";
import { selectEventById, useTimelineStore } from "../store";

const CHAIN_STEPS = [
  "Source captured (immutable)",
  "Extraction worker · candidate event",
  "Validation · dedup & conflict check",
];

export function EvidenceDrawer() {
  const router = useRouter();
  const evidenceId = useTimelineStore((s) => s.evidenceId);
  const closeEvidence = useTimelineStore((s) => s.closeEvidence);
  const openCorrection = useTimelineStore((s) => s.openCorrection);
  const dispute = useTimelineStore((s) => s.dispute);
  const ev = useTimelineStore(selectEventById(evidenceId));

  if (!ev) {
    return (
      <OverlayShell
        open={false}
        onClose={closeEvidence}
        title="Why is this here?"
      />
    );
  }

  const m = TYPE_META[ev.type];
  const meta = { icon: m?.icon ?? "pulse", c: m?.c ?? "#666", bg: (m?.c ?? "#666") + "22" };
  const chain = [
    ...CHAIN_STEPS,
    `Current status: ${ev.status}`,
  ];

  const viewSource = () => {
    closeEvidence();
    if (ev.session) {
      useChatStore.getState().openSession(ev.session);
      router.push("/chat");
    } else if (ev.docId) {
      useDocumentsStore.getState().setViewId(ev.docId);
    } else {
      toast(`Source: ${ev.sourceMsg}`, "link");
    }
  };

  return (
    <OverlayShell open onClose={closeEvidence} title="Why is this here?">
      <OverlayHead title={<b className="ptitle-sm">Why is this here?</b>} onClose={closeEvidence} />
      <div className="scroll" style={{ padding: "0 22px 22px" }}>
        <div className="evhead">
          <span className="tic" style={{ background: meta.bg, color: meta.c }}>
            <Icon n={meta.icon} s={18} />
          </span>
          <div>
            <b>{ev.title}</b>
            <span className="small block">{ev.when}</span>
          </div>
        </div>

        <div className="evbadges">
          <ProvBadge src={ev.src} />
          <StatusBadge st={ev.status} />
          {ev.verifiedBy && (
            <span className="badge">
              <i className="badge-dot" style={{ background: "#2F8F5B" }} />by {ev.verifiedBy}
            </span>
          )}
        </div>

        <p className="small" style={{ margin: "12px 0" }}>
          {ev.desc}
        </p>

        <Label>Original evidence</Label>
        <div className="quote">{ev.sourceMsg}</div>

        <Label>Provenance chain</Label>
        {chain.map((st, i) => (
          <div key={st} className="chain">
            <span
              className="chaindot"
              style={{
                background:
                  i === chain.length - 1
                    ? STATUS_COLORS[ev.status as VerificationStatus]
                    : "var(--ink3)",
              }}
            />
            <span className="small">{st}</span>
          </div>
        ))}

        {(ev.corrections?.length ?? 0) > 0 && (
          <>
            <Label>Corrections (original preserved)</Label>
            {ev.corrections!.map((c, i) => (
              <div key={i} className="quote">
                “{c.note}” — {c.at}
              </div>
            ))}
          </>
        )}

        <div className="actrow" style={{ marginTop: 16 }}>
          <Btn kind="soft" sm icon="edit" onClick={() => openCorrection(ev.id)}>
            Correct
          </Btn>
          <Btn kind="soft" sm icon="alert" onClick={() => dispute(ev.id)}>
            Dispute
          </Btn>
          <Btn kind="dark" sm icon="eye" onClick={viewSource}>
            View source
          </Btn>
        </div>
      </div>
    </OverlayShell>
  );
}
