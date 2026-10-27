/** Cheap deterministic routing: no additional model call, provider embedding or raw-chat search. */
export function contextPlan(question: string) {
  const historical =
    /\b(still|again|previous(?:ly)?|before|remember|recall|last|yesterday|ago|history|timeline|earlier|used to|anymore|no longer|better|worse|improv\w*|continu\w*)\b/i.test(
      question,
    );
  const health =
    /\b(stress\w*|anxious|anxiety|pain\w*|ache\w*|aching|chest|shoulder\w*|back|arm\w*|throat|heart|hurt\w*|symptom\w*|tired\w*|fatigue|sleep\w*|medicin\w*|medicat\w*|allerg\w*|prescri\w*|result\w*|blood|breath\w*|headache\w*|stomach|belly|knee|legs?|jogg\w*|running|fever|dizz\w*|nause\w*|vomit\w*|cough\w*|rash|diagnos\w*|condition\w*|health)\b/i.test(
      question,
    );
  const dated =
    /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(
      question,
    );
  const broad = /\b(history|overview|summary|summarize|everything)\b/i.test(
    question,
  );
  return {
    timeline: historical || health || dated || broad,
    summaries: historical && !health,
    broad,
  };
}

/** Keep the latest turn intact, then include a contiguous bounded active-chat window. */
export function boundedHistory<T extends { content: string }>(
  messages: T[],
): T[] {
  const result: T[] = [];
  let size = 0;
  for (const message of [...messages].reverse()) {
    if (
      result.length &&
      (result.length >= 12 || size + message.content.length > 10000)
    )
      break;
    result.unshift(message);
    size += message.content.length;
  }
  return result;
}

/** Calendar date selection, preserving uncertainty for unsupported/ambiguous date phrases. */
export function recallDay(
  question: string,
  timezone: string,
  now: Date,
): string | null {
  const explicit = question.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (explicit) {
    const parsed = new Date(explicit[1]);
    return Number.isFinite(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === explicit[1]
      ? explicit[1]
      : null;
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (key: string) => parts.find((p) => p.type === key)!.value;
  const local = new Date(
    `${part("year")}-${part("month")}-${part("day")}T12:00:00Z`,
  );
  if (/\byesterday\b/i.test(question)) local.setUTCDate(local.getUTCDate() - 1);
  else if (/\btoday\b/i.test(question)) {
    /* source local calendar */
  } else {
    const named =
      question.match(
        /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/i,
      ) ??
      question.match(
        /\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?\b/i,
      );
    if (named) {
      const parsed = new Date(
        `${named[1]} ${named[2]} ${named[3] ?? part("year")} 12:00:00 GMT`,
      );
      return Number.isFinite(parsed.getTime())
        ? parsed.toISOString().slice(0, 10)
        : null;
    }
    const weekdays = [
      "sunday",
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
    ];
    const day = weekdays.findIndex((d) =>
      new RegExp(`\\b${d}\\b`, "i").test(question),
    );
    if (day < 0) return null;
    const difference = (local.getUTCDay() - day + 7) % 7;
    local.setUTCDate(local.getUTCDate() - (difference || 7));
  }
  return local.toISOString().slice(0, 10);
}
