import "server-only";
import { DomainError } from "@/lib/errors";
export type ParsedPage = { page: number; text: string };
export interface DocumentParser {
  parse(bytes: Uint8Array, mime: string): Promise<ParsedPage[]>;
}
export function inspectUpload(bytes: Uint8Array, mime: string) {
  if (bytes.byteLength < 1 || bytes.byteLength > 10 * 1024 * 1024)
    throw new DomainError("ACCESS_DENIED");
  const header = Buffer.from(bytes.subarray(0, 8)).toString("ascii");
  if (mime === "application/pdf") {
    if (!header.startsWith("%PDF-")) throw new DomainError("ACCESS_DENIED");
    // Quarantine active/encrypted payloads; text extraction never executes actions or renders originals inline.
    return /\/(JavaScript|JS|OpenAction|AA|Launch|EmbeddedFile|RichMedia|XFA|Encrypt)\b/i.test(
      Buffer.from(bytes).toString("latin1"),
    )
      ? "quarantined"
      : "queued";
  }
  if (mime !== "text/plain" || header.startsWith("%PDF-"))
    throw new DomainError("ACCESS_DENIED");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (/[\x00-\x08\x0e-\x1f]/.test(text)) throw new DomainError("ACCESS_DENIED");
  return "queued";
}
export const documentParser: DocumentParser = {
  async parse(bytes, mime) {
    if (mime === "text/plain") {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (text.length > 90000) throw new DomainError("ACCESS_DENIED");
      return [{ page: 1, text }];
    }
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const task = getDocument({
      data: bytes,
      useSystemFonts: false,
      disableFontFace: true,
    });
    const timeout = setTimeout(() => void task.destroy(), 20000);
    try {
      const document = await task.promise;
      if (document.numPages > 100) throw new DomainError("ACCESS_DENIED");
      const pages: ParsedPage[] = [];
      let size = 0;
      for (let page = 1; page <= document.numPages; page++) {
        const current = await document.getPage(page);
        const items = await current.getTextContent();
        const text = items.items
          .map((item) => ("str" in item ? item.str : ""))
          .join(" ");
        size += text.length;
        if (size > 90000) throw new DomainError("ACCESS_DENIED");
        pages.push({ page, text });
        current.cleanup();
      }
      if (!pages.some((p) => p.text.trim()))
        throw new DomainError("PROVIDER_UNAVAILABLE");
      return pages;
    } finally {
      clearTimeout(timeout);
      await task.destroy();
    }
  },
};
