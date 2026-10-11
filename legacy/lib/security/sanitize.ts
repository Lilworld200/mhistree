/**
 * Input Sanitization Utility (`lib/security/sanitize.ts`)
 * ─────────────────────────────────────────────────────────────────
 * Sanitizes input text using isomorphic-dompurify to prevent XSS
 * and prompt injection exploits.
 */
import DOMPurify from "isomorphic-dompurify";

export function sanitizeInput(rawText: string): string {
  if (!rawText) return "";
  return DOMPurify.sanitize(rawText.trim());
}
