"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { Icon } from "@/components/ui/icons";
import type { Episode } from "../model";
import { useTimelineStore } from "../store";

export function EpisodeCard({ episode }: { episode: Episode }) {
  const [open, setOpen] = useState(false);
  const openEvidence = useTimelineStore((s) => s.openEvidence);

  return (
    <>
      <button className="card epcard" onClick={() => setOpen(!open)}>
        <div className="epic">
          <Icon n="pulse" s={18} c="#478BEE" />
        </div>
        <div className="eptxt">
          <b>{episode.title}</b>
          <span>
            {episode.span} · {episode.count} events
            {episode.trend ? ` · ${episode.trend}` : ""}
          </span>
        </div>
        <span className="hpill hpill-dark">Episode</span>
        <motion.span animate={{ rotate: open ? 90 : 0 }}>
          <Icon n="chev" s={16} />
        </motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: "hidden" }}
          >
            <div className="card card-inset" style={{ margin: "0 0 18px", padding: 16 }}>
              <p className="small">{episode.summary}</p>
              <div className="qchips">
                {episode.eventIds.map((id) => {
                  return (
                    <button
                      key={id}
                      className="pill pill-tiny on"
                      onClick={() => openEvidence(id)}
                    >
                      <EpisodeChipLabel id={id} />
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

function EpisodeChipLabel({ id }: { id: string }) {
  const title = useTimelineStore((s) => s.events.find((e) => e.id === id)?.title);
  return <>{title ?? id}</>;
}
