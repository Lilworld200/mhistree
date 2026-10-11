/**
 * Medical Document Parser Service (`lib/documents/parser.ts`)
 * ─────────────────────────────────────────────────────────────────
 * Extracts text content from PDFs, text files, and images (OCR).
 * Uses lazy imports with fallbacks so the application stays robust.
 */

export interface ParsedDocument {
  text: string;
  pageCount?: number;
  format: "pdf" | "image" | "text";
}

export async function parseDocumentContent(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): Promise<ParsedDocument> {
  const cleanMime = mimeType.toLowerCase();

  // 1. Plain Text
  if (
    cleanMime.includes("text") ||
    fileName.endsWith(".txt") ||
    fileName.endsWith(".md")
  ) {
    return {
      text: buffer.toString("utf-8"),
      format: "text",
    };
  }

  // 2. PDF Documents
  if (cleanMime.includes("pdf") || fileName.endsWith(".pdf")) {
    try {
      // Lazy load pdf-parse
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse");
      const pdfData = await pdfParse(buffer);
      return {
        text: pdfData.text || "",
        pageCount: pdfData.numpages || 1,
        format: "pdf",
      };
    } catch {
      // Fallback if pdf-parse is uninstalled or fails
      return {
        text: buffer.toString("utf-8").replace(/[^\x20-\x7E\n\r]/g, " "),
        format: "pdf",
      };
    }
  }

  // 3. Image OCR (PNG/JPEG/WebP)
  if (cleanMime.includes("image") || /\.(png|jpg|jpeg|webp)$/i.test(fileName)) {
    try {
      // Lazy load tesseract.js
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { recognize } = require("tesseract.js");
      const result = await recognize(buffer, "eng");
      return {
        text: result.data?.text || "",
        format: "image",
      };
    } catch {
      return {
        text: `Medical Image Document: ${fileName}`,
        format: "image",
      };
    }
  }

  // Default fallback
  return {
    text: buffer.toString("utf-8"),
    format: "text",
  };
}
