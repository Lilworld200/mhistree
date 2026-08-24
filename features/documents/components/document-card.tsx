"use client";

import { Icon } from "@/components/ui/icons";
import { Reveal } from "@/components/ui/reveal";
import { useDocumentsStore } from "../store";
import type { DocumentRecord } from "../types";

export function DocumentCard({ doc, index }: { doc: DocumentRecord; index: number }) {
  const setViewId = useDocumentsStore((s) => s.setViewId);
  return (
    <Reveal d={index * 0.05}>
      <button className="card doccard" onClick={() => setViewId(doc.id)}>
        <span className="tic" style={{ background: "#C08A2D22", color: "#C08A2D" }}>
          <Icon n="doc" s={18} />
        </span>
        <span className="evmain">
          <b>{doc.name}</b>
          <span className="evwhen">
            {doc.type} · {doc.date}
          </span>
          <span className="evbadges">
            {doc.processing ? (
              <span className="badge" style={{ color: "var(--amber)" }}>
                <i className="badge-dot" style={{ background: "var(--amber)" }} />
                Processing
              </span>
            ) : (
              <span className="badge" style={{ color: "var(--green)" }}>
                <i className="badge-dot" style={{ background: "var(--green)" }} />
                Processed
              </span>
            )}
          </span>
        </span>
        <Icon n="chev" s={16} />
      </button>
    </Reveal>
  );
}
