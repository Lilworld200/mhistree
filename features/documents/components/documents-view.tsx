"use client";

import { Btn } from "@/components/ui/button";
import { DocumentCard } from "./document-card";
import { useDocumentsStore } from "../store";

export function DocumentsView() {
  const documents = useDocumentsStore((s) => s.documents);
  const uploading = useDocumentsStore((s) => s.uploading);
  const upload = useDocumentsStore((s) => s.upload);

  return (
    <div className="scroll">
      <div className="phead">
        <div>
          <h1 className="ptitle">Documents</h1>
          <p className="psub">
            Labs, prescriptions and reports — evidence behind your timeline
          </p>
        </div>
        <Btn kind="dark" icon="up" onClick={upload} disabled={uploading}>
          {uploading ? "Processing…" : "Upload document"}
        </Btn>
      </div>
      <div className="grid3" style={{ marginTop: 6 }}>
        {documents.map((d, i) => (
          <DocumentCard key={d.id} doc={d} index={i} />
        ))}
      </div>
    </div>
  );
}
