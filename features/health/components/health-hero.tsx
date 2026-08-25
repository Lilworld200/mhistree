"use client";

import { motion } from "motion/react";
import { Avatar } from "@/components/ui/avatar";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast-store";
import { useSettingsStore } from "@/features/settings/store";

export function HealthHero() {
  const reminders = useSettingsStore((s) => s.prefs.reminders);

  return (
    <div className="hero">
      <div className="hrow">
        <span className="hid">
          <Avatar ring="#F4A8AC" size={30} name="P" />
          <b>Health Dashboard</b>
        </span>
        <button
          className="hutil"
          aria-label="Reminders"
          onClick={() =>
            toast(
              reminders ? "Reminders are enabled" : "Reminders are disabled",
              "bell",
            )
          }
        >
          <Icon n="bell" s={16} />
        </button>
      </div>
      <div className="hcenter">
        <span className="hpill">Live Vitals & Health Summary</span>
        <motion.div
          className="display"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          style={{ fontSize: "clamp(22px, 3vw, 32px)", marginTop: 6 }}
        >
          Active Monitoring
        </motion.div>
        <span className="hsub">Connected to Longitudinal Supabase Records</span>
      </div>
    </div>
  );
}
