"use client";

import { Icon } from "@/components/ui/icons";
import { Label } from "@/components/ui/label";
import { Btn } from "@/components/ui/button";
import { OverlayHead, OverlayShell } from "@/components/ui/overlay-shell";
import { useAiAssistantStore } from "@/features/ai-assistant/store";
import { useTimelineStore } from "@/features/timeline/store";
import { useDocumentsStore } from "../store";

export function DocViewerDrawer() {
  const viewId = useDocumentsStore((s) => s.viewId);
  const setViewId = useDocumentsStore((s) => s.setViewId);
  const doc = useDocumentsStore((s) => (s.viewId ? s.documents.find((d) => d.id === s.viewId) : undefined));
  const close = () => setViewId(null);

  return (
    <OverlayShell open={!!viewId} onClose={close} title={doc?.name ?? "Document"}>
      {doc && (
        <>
          <OverlayHead title={<b className="ptitle-sm">{doc.name}</b>} onClose={close} />
          <div className="scroll" style={{ padding: "0 22px 22px" }}>
            <div className="preview" aria-hidden="true">
              <div className="pvline w60" />
              <div className="pvline" />
              <div className="pvline" />
              <div className="pvline w80" />
              <div className="pvline w40" />
            </div>

            <Label>Metadata</Label>
            <div className="kv"><span>Type</span><b>{doc.type}</b></div>
            <div className="kv"><span>Facility</span><b>{doc.facility}</b></div>
            <div className="kv"><span>Date</span><b>{doc.date}</b></div>
            <div className="kv"><span>Source</span><b>Uploaded by patient</b></div>

            <Label right={<Icon n="spark" s={14} c="#C08A2D" />}>AI extraction</Label>
            {doc.processing ? (
              <p className="small">
                Extraction pending — the source document is already preserved.
              </p>
            ) : (
              doc.extracted.map((x) => (
                <div key={x} className="kv">
                  <Icon n="check" s={14} c="#2F8F5B" />
                  <b>{x}</b>
                </div>
              ))
            )}

            <Label>Linked health events</Label>
            <LinkedChips ids={doc.linked} />

            <div className="actrow" style={{ marginTop: 16 }}>
              <Btn
                kind="soft"
                sm
                icon="spark"
                onClick={() => {
                  close();
                  useAiAssistantStore.getState().open("document");
                }}
              >
                Ask Mhistree
              </Btn>
            </div>
          </div>
        </>
      )}
    </OverlayShell>
  );
}

function LinkedChips({ ids }: { ids: string[] }) {
  const close = () => useDocumentsStore.getState().setViewId(null);
  const openEvidence = useTimelineStore((s) => s.openEvidence);
  const titleFor = useTimelineStore((s) => {
    const map: Record<string, string | undefined> = {};
    for (const e of s.events) map[e.id] = e.title;
    return map;
  });
  return (
    <div className="qchips">
      {ids.map((id) => (
        <button
          key={id}
          className="pill pill-tiny on"
          onClick={() => {
            close();
            openEvidence(id);
          }}
        >
          {titleFor[id] ?? id}
        </button>
      ))}
      {ids.length === 0 && <p className="small">No linked events yet.</p>}
    </div>
  );
}
