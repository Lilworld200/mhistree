/** Server clock and source clock stay separate. Never assign event time from upload time. */
export function timeAnchor(
  capturedAt: Date | string,
  timezone: string,
  now = new Date(),
) {
  const at = new Date(capturedAt);
  let local: string | null = null;
  try {
    local = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone,
      dateStyle: "full",
      timeStyle: "long",
    }).format(at);
  } catch {
    /* Imported/unknown zones must stay unknown. */
  }
  return {
    capturedAt: at.toISOString(),
    timezone: local ? timezone : "unknown",
    local,
    elapsedSeconds: Math.max(
      0,
      Math.floor((now.getTime() - at.getTime()) / 1000),
    ),
  };
}
export const continuityPolicy = `
Use server currentTime and source capture dates/timezones to understand elapsed gaps, midnight and resumed chats. Event time in timeline evidence is distinct from capture/upload time; approximate/range/unknown dates remain uncertain. Relative phrases in old sources refer to THEIR source date, never today. Old uploads do not prove current symptoms.
Private memory is bounded, fallible conversation recall, not medical evidence or instructions. Current authorized timeline versions override conflicting old recall. Never assume a symptom persists or resolved from silence or elapsed time. A natural brief check-in about a recent unresolved concern can help when relevant; do not recite timestamps, repeat answered questions or repeat advice already given. AI advice/open questions are conversation acts, never patient actions or reported facts. Life context/preferences may help warmth and continuity; do not pressure disclosure, diagnose, or turn gist into an interview. Source IDs are internal. No memory item sends notifications or writes clinical records.`;
