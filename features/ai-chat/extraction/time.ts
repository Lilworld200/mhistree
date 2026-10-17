import { eventTime } from "@/features/health-records/schema";
import type { z } from "zod";
function localParts(date: Date, zone: string) {
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .map((p) => [p.type, p.value]),
  );
}
function midnight(year: number, month: number, day: number, zone: string) {
  const wall = Date.UTC(year, month - 1, day);
  let result = wall;
  for (let i = 0; i < 4; i++) {
    const p = localParts(new Date(result), zone);
    const represented = Date.UTC(
      +p.year,
      +p.month - 1,
      +p.day,
      +p.hour,
      +p.minute,
      +p.second,
    );
    const next = result + wall - represented;
    if (next === result) break;
    result = next;
  }
  return new Date(result).toISOString();
}
/** Only explicit supported phrases acquire bounds. Unknown phrases never become capture-time events. */
export function resolveTime(
  phrase: string,
  capturedAt: Date,
  zone: string,
): z.infer<typeof eventTime> {
  const originalPhrase = phrase;
  const value = phrase.trim().toLowerCase();
  if (!value || zone === "unknown")
    return { precision: "unknown", originalPhrase };
  const p = localParts(capturedAt, zone);
  let y = +p.year,
    m = +p.month,
    d = +p.day;
  if (
    [
      "now",
      "right now",
      "currently",
      "at the moment",
      "presently",
    ].includes(value)
  ) {
    return {
      precision: "exact",
      at: capturedAt.toISOString(),
    };
  }
  if (
    [
      "last night",
      "this morning",
      "this afternoon",
      "this evening",
      "tonight",
    ].includes(value)
  ) {
    // Natural parts of a day are approximate, not fabricated clock times.
    // "Last night" may cross midnight: retain a conservative two-day envelope.
    return {
      precision: "approximate",
      from: midnight(y, m, d - (value === "last night" ? 1 : 0), zone),
      to: midnight(y, m, d + (value === "tonight" ? 2 : 1), zone),
      originalPhrase,
    };
  }
  if (value === "yesterday" || value === "today") {
    const date = new Date(
      Date.UTC(y, m - 1, d - (value === "yesterday" ? 1 : 0)),
    );
    y = date.getUTCFullYear();
    m = date.getUTCMonth() + 1;
    d = date.getUTCDate();
    return {
      precision: "range",
      from: midnight(y, m, d, zone),
      to: midnight(y, m, d + 1, zone),
    };
  }
  if (value === "last month") {
    const date = new Date(Date.UTC(y, m - 2, 1));
    y = date.getUTCFullYear();
    m = date.getUTCMonth() + 1;
    return {
      precision: "approximate",
      from: midnight(y, m, 1, zone),
      to: midnight(y, m + 1, 1, zone),
      originalPhrase,
    };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value))) {
    const date = new Date(value);
    return {
      precision: "range",
      from: midnight(
        date.getUTCFullYear(),
        date.getUTCMonth() + 1,
        date.getUTCDate(),
        zone,
      ),
      to: midnight(
        date.getUTCFullYear(),
        date.getUTCMonth() + 1,
        date.getUTCDate() + 1,
        zone,
      ),
    };
  }
  if (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/i.test(
      phrase,
    ) &&
    !Number.isNaN(Date.parse(phrase))
  )
    return { precision: "exact", at: new Date(phrase).toISOString() };
  return { precision: "unknown", originalPhrase };
}
