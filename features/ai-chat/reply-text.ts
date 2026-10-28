/** Strip internal model echoes at every assistant presentation boundary. Never apply to patient sources. */
export function replyText(value: string): string {
  let text = value.replace(
    /```(?:json)?\s*\{[^`]*?(?:"capturedAt"|"elapsedSeconds"|"sourceTimezone")[^`]*?\}\s*```/gi,
    "",
  );
  // Balanced JSON scanning handles pretty printing, braces in strings and multiple echoes.
  const label = /(?:\*\*)?source\s+capture(?:\*\*)?\s*:\s*/gi;
  let match: RegExpExecArray | null;
  while ((match = label.exec(text))) {
    const start = match.index;
    const jsonStart = label.lastIndex;
    let end = jsonStart,
      depth = 0,
      quoted = false,
      escaped = false;
    if (text[jsonStart] === "{") {
      for (; end < text.length; end++) {
        const char = text[end];
        if (quoted) {
          if (escaped) escaped = false;
          else if (char === "\\") escaped = true;
          else if (char === '"') quoted = false;
        } else if (char === '"') quoted = true;
        else if (char === "{") depth++;
        else if (char === "}" && --depth === 0) {
          end++;
          break;
        }
      }
      // An incomplete internal block is unsafe to publish.
      if (depth) end = text.length;
    } else {
      const newline = text.indexOf("\n", jsonStart);
      end = newline < 0 ? text.length : newline;
    }
    text = text.slice(0, start) + text.slice(end);
    label.lastIndex = 0;
  }
  text = text.replace(/^\s*\{[^\n]*"capturedAt"[^\n]*\}\s*$/gm, "");
  if (
    /\b(?:capturedAt|elapsedSeconds|sourceDates|privateMemory|source_fingerprint|sourceQuotes|careConfirmationId|care_confirmation_id|dialogue|proposal_version|confirmation_id|careActionResults|medicationSafety|contactPreparationAccepted)\b\s*["”’']?\s*:/i.test(
      text,
    )
  )
    return "";
  return text.trim();
}
