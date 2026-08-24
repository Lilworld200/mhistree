"use client";

import { motion } from "motion/react";
import { Avatar, AvatarRail } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast-store";
import { AVATARS, CARE_TEAM } from "@/lib/demo/people";
import { useSettingsStore } from "@/features/settings/store";

export function HealthHero() {
  const reminders = useSettingsStore((s) => s.prefs.reminders);

  return (
    <>
      <div className="hero">
        <div className="hrow">
          <span className="hid">
            <Avatar img={AVATARS.nati} ring="#F4A8AC" size={30} name="N" />
            <b>Nati</b>
          </span>
          <button
            className="hutil"
            aria-label="Reminders"
            onClick={() =>
              toast(
                reminders ? "Reminders are on" : "Reminders are off",
                "bell",
              )
            }
          >
            <Icon n="bell" s={16} />
          </button>
        </div>
        <div className="hcenter">
          <span className="hpill">Today’s health</span>
          <motion.div
            className="display"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            82
          </motion.div>
          <span className="hsub">Good — steady week · 1 open thread</span>
        </div>
      </div>

      <AvatarRail>
        {CARE_TEAM.map((c, i) => (
          <motion.span
            key={c.name}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 + i * 0.07 }}
          >
            <Avatar img={c.img} ring={c.ring} size={52} name={c.name} />
          </motion.span>
        ))}
      </AvatarRail>
    </>
  );
}
