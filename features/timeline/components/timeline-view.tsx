"use client";

import * as ToggleGroup from "@radix-ui/react-toggle-group";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icons";
import { Reveal } from "@/components/ui/reveal";
import { cn } from "@/lib/utils/cn";
import { createClient } from "@/lib/supabase/client";
import { EpisodeCard } from "./episode-card";
import { EventCard } from "./event-card";
import {
  TL_SRC_FILTERS,
  TL_TYPE_FILTERS,
  type ProvenanceSource,
  type TimelineEvent,
} from "../model";
import { useTimelineStore } from "../store";

function matchesFilters(
  ev: TimelineEvent,
  type: string,
  src: string,
  q: string,
): boolean {
  const t = TL_TYPE_FILTERS.find((f) => f.label === type);
  const s = TL_SRC_FILTERS.find((f) => f.label === src);
  const typeOk = !t?.value || ev.type === t.value;
  const srcOk = !s?.value || ev.src === (s.value as ProvenanceSource);
  const qOk =
    !q ||
    ev.title.toLowerCase().includes(q.toLowerCase()) ||
    ev.desc.toLowerCase().includes(q.toLowerCase());
  return typeOk && srcOk && qOk;
}

export function TimelineView() {
  const events = useTimelineStore((s) => s.events);
  const episodes = useTimelineStore((s) => s.episodes);
  const typeFilter = useTimelineStore((s) => s.typeFilter);
  const srcFilter = useTimelineStore((s) => s.srcFilter);
  const loading = useTimelineStore((s) => s.loading);
  const error = useTimelineStore((s) => s.error);
  const setTypeFilter = useTimelineStore((s) => s.setTypeFilter);
  const setSrcFilter = useTimelineStore((s) => s.setSrcFilter);
  const fetchLiveEvents = useTimelineStore((s) => s.fetchLiveEvents);

  const [q, setQ] = useState("");
  const [appliedQ, setAppliedQ] = useState("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        fetchLiveEvents(user.id);
      }
    });
  }, [fetchLiveEvents]);

  useEffect(() => {
    const t = setTimeout(() => setAppliedQ(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q]);

  const unfiltered = typeFilter === "All" && srcFilter === "All" && !appliedQ;
  const list = events.filter((e) =>
    matchesFilters(e, typeFilter, srcFilter, appliedQ),
  );

  return (
    <div className="scroll">
      <div className="phead">
        <div>
          <h1 className="ptitle">Health Timeline</h1>
          <p className="psub">
            Your longitudinal record · every fact keeps its source
          </p>
        </div>
        <div className="searchpill">
          <Icon n="search" s={15} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search events…"
            aria-label="Search events"
          />
          {q && (
            <button
              aria-label="Clear search"
              onClick={() => setQ("")}
              style={{
                display: "grid",
                placeItems: "center",
                color: "var(--ink3)",
              }}
            >
              <Icon n="x" s={13} />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div
          className="card card-inset"
          style={{
            padding: 16,
            marginBottom: 16,
            borderColor: "#E57373",
            color: "#D32F2F",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Icon n="alert" s={18} />
          <span>
            <b>Failed to fetch timeline:</b> {error}. Check terminal/browser
            console for details.
          </span>
        </div>
      )}

      <ToggleGroup.Root
        type="single"
        className="pills"
        value={typeFilter}
        onValueChange={(v) => v && setTypeFilter(v)}
        aria-label="Filter events by type"
      >
        {TL_TYPE_FILTERS.map((f) => (
          <ToggleGroup.Item key={f.label} value={f.label} className="pill">
            {f.label}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>

      <ToggleGroup.Root
        type="single"
        className="pills pills-sub"
        value={srcFilter}
        onValueChange={(v) => v && setSrcFilter(v)}
        aria-label="Filter events by source"
      >
        {TL_SRC_FILTERS.map((f) => (
          <ToggleGroup.Item
            key={f.label}
            value={f.label}
            className="pill pill-tiny"
          >
            {f.label}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>

      {unfiltered && (
        <Reveal>
          {episodes.map((ep) => (
            <EpisodeCard key={ep.id} episode={ep} />
          ))}
        </Reveal>
      )}

      <div className="mlabel" style={{ margin: "6px 4px 12px" }}>
        TIMELINE RECORDS
      </div>

      <div className="tl">
        {list.map((ev, i) => (
          <Reveal key={ev.id} d={Math.min(i * 0.04, 0.2)}>
            <EventCard ev={ev} />
          </Reveal>
        ))}
        {loading && (
          <div
            className={cn("card card-inset small")}
            style={{ padding: 22, textAlign: "center", color: "var(--ink2)" }}
          >
            Fetching timeline events from Supabase...
          </div>
        )}
        {!loading && list.length === 0 && (
          <div
            className={cn("card card-inset small")}
            style={{ padding: 22, textAlign: "center", color: "var(--ink2)" }}
          >
            {error
              ? "Unable to display events due to fetch error."
              : "No health timeline events found."}
          </div>
        )}
      </div>
    </div>
  );
}
