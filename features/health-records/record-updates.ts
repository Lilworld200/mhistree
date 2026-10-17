"use client";

export const RECORDS_CHANGED = "mhistree:records-changed";

/** No clinical data or identifiers enter browser events. Listeners must refetch
 * through current server authorization; an event is never a data/access grant. */
export function notifyRecordsChanged() {
  window.dispatchEvent(new Event(RECORDS_CHANGED));
}
