/** Cheap deterministic routing: no additional model call, provider embedding or raw-chat search. */
export type ContextTurn = {
  role: string;
  content: string;
  dialogue?: {
    topic?: string;
    decision?: string;
    question?: { kind: string; subject: string };
  } | null;
};
export function contextPlan(question: string, history: ContextTurn[] = []) {
  const historical =
    /\b(still|again|previous(?:ly)?|before|remember|recall|last|yesterday|ago|history|timeline|earlier|used to|anymore|no longer|better|worse|improv\w*|continu\w*)\b/i.test(
      question,
    );
  const medication =
    /\b(omeprazole|paracetamol|parastamol|acetaminophen|ibuprofen|drugs?|co[ -]?trimazole|co[ -]?trimoxazole|clotrimazole|tablets?|capsules?|pills?|doses?|antibiotic\w*|medicin\w*|medicat\w*|prescri\w*|interact\w*)\b/i.test(
      question,
    ) ||
    /\b(?:safe for me|can i|should i|want to|thinking of|considering)\b.{0,45}\b(?:take|taking|drink|use|start|stop)\b/i.test(
      question,
    );
  const personalMedication = medication && /\b(i|me|my|mine)\b/i.test(question);
  const health =
    /\b(stress\w*|anxious|anxiety|pain\w*|ache\w*|aching|chest|shoulder\w*|back|arm\w*|throat|heart|hurt\w*|symptom\w*|tired\w*|fatigue|sleep\w*|medicin\w*|medicat\w*|allerg\w*|prescri\w*|result\w*|blood|breath\w*|headache\w*|stomach|belly|knee|legs?|jogg\w*|running|fever|dizz\w*|nause\w*|vomit\w*|cough\w*|rash|diagnos\w*|condition\w*|health)\b/i.test(
      question,
    );
  const dated =
    /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(
      question,
    );
  const broad =
    /\b(history|timeline|overview|summary|summarize|everything)\b/i.test(
      question,
    );
  const previous = history.filter((m) => m.content !== question).slice(-6);
  const topicChange =
    /\b(change (?:the )?(?:subject|topic)|something (?:else|unrelated)|anyway|instead.{0,12}(?:code|coding)|let.s talk about)\b/i.test(
      question,
    );
  const shortFollowUp =
    /^(?:yes|yeah|yep|no|nope|okay|ok|sure|still hurts|it does|it is|same thing|that one|what about this one|go ahead|proceed)[.! ]*$/i.test(
      question.trim(),
    ) || /^(?:still|again|it |that |this |what about)/i.test(question.trim());
  let reset = -1;
  previous.forEach((m, i) => {
    if (
      m.dialogue?.topic === "everyday" ||
      /\b(change (?:the )?(?:subject|topic)|something unrelated|let.s talk about)\b/i.test(
        m.content,
      )
    )
      reset = i;
  });
  const active = previous.slice(reset + 1);
  const inheritedHealth =
    !topicChange &&
    shortFollowUp &&
    active.some(
      (m) =>
        m.dialogue?.topic === "health" ||
        /\b(throat|pain|stomach|belly|medicin\w*|medicat\w*|omeprazole|co[ -]?trimazole)\b/i.test(
          m.content,
        ),
    );
  const contextual = inheritedHealth
    ? active
        .filter((m) => m.role === "patient" || m.role === "user")
        .slice(-3)
        .map((m) => m.content)
        .join(" ")
    : "";
  const subject = inheritedHealth
    ? ([...active].reverse().find((m) => m.role === "assistant")?.dialogue
        ?.question?.subject ?? "")
    : "";
  return {
    timeline:
      !topicChange &&
      (historical || health || medication || inheritedHealth || dated || broad),
    medication:
      !topicChange &&
      (medication ||
        (inheritedHealth &&
          active.some((m) =>
            /\b(medicin\w*|medicat\w*|omeprazole|co[ -]?trimazole|take|tablet)\b/i.test(
              m.content,
            ),
          ))),
    personalMedication,
    contact:
      /\b(contact|message|ask|speak|talk|doctor|nurse|practitioner|appointment|book)\b/i.test(
        question,
      ) ||
      personalMedication ||
      (inheritedHealth &&
        active.some((m) => m.dialogue?.question?.kind === "offer_contact")),
    searchText: `${contextual} ${subject} ${question}`.trim().slice(-6000),
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
