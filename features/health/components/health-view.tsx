"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Btn, IconBtn } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { useAiAssistantStore } from "@/features/ai-assistant/store";
import { useChatStore } from "@/features/chat/store";
import { useTimelineStore } from "@/features/timeline/store";
import { BaselineCard, cleanMedLabel } from "./baseline-card";
import { HealthHero } from "./health-hero";
import { RecentActivityCard } from "./recent-activity-card";
import { UpcomingCard } from "./upcoming-card";
import { VitalsCard } from "./vitals-card";

interface ProfileDerivedHealth {
  conditions?: { name: string; level: string }[];
  allergies?: { name: string; level: string }[];
  resolved?: { name: string; resolved_at: string }[];
}

export function HealthView() {
  const router = useRouter();
  const events = useTimelineStore((s) => s.events);
  const recent = events.slice(0, 3);
  const openAssistant = useAiAssistantStore((s) => s.open);

  // Derived profile data (two-tier conditions + resolved history).
  const [derived, setDerived] = useState<ProfileDerivedHealth | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile?user_id=default")
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          json:
            | { profile?: { derived_health?: ProfileDerivedHealth } | null }
            | null,
        ) => {
          if (!cancelled && json?.profile?.derived_health) {
            setDerived(json.profile.derived_health);
          }
        },
      )
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Active medication labels for the baseline card (live from /api/timeline).
  const activeMedEvents = events.filter(
    (e) => e.type === "Medication" && /Status:\s*active/i.test(e.desc),
  );
  const medLabel =
    activeMedEvents.length > 0
      ? activeMedEvents.length === 1
        ? cleanMedLabel(activeMedEvents[0].title)
        : `${activeMedEvents.length} on record (${activeMedEvents
            .slice(0, 2)
            .map((e) => cleanMedLabel(e.title))
            .join(", ")})`
      : null;

  // Two-tier condition labels + resolved history (from derived_health JSONB).
  const confirmedConditions = [
    ...(derived?.conditions?.filter((c) => c.level === "confirmed") ?? []),
    ...(derived?.allergies?.filter((a) => a.level === "confirmed") ?? []),
  ].map((c) => c.name);
  const conditionLabel = confirmedConditions.length
    ? confirmedConditions.join(", ")
    : null;
  const allergyLabel =
    derived?.allergies && derived.allergies.length > 0
      ? derived.allergies.map((a) => a.name).join(", ")
      : null;
  const resolvedList =
    derived?.resolved?.map((r) => ({
      name: r.name,
      resolvedAt: r.resolved_at,
    })) ?? null;

  const startCheckIn = () => {
    useChatStore.getState().newChat();
    setTimeout(
      () =>
        useChatStore
          .getState()
          .send("Starting my daily check-in — overall I feel okay, a bit tired."),
      150,
    );
    router.push("/chat");
  };

  return (
    <div className="scroll">
      <Reveal>
        <HealthHero />
      </Reveal>

      <Reveal d={0.08}>
        <div className="actrow">
          <IconBtn icon="spark" title="Ask Mhistree" onClick={() => openAssistant("health")} />
          <IconBtn icon="doc" title="Documents" onClick={() => router.push("/documents")} />
          <Btn kind="soft" onClick={() => openAssistant("health")}>
            Review plan
          </Btn>
          <Btn kind="dark" icon="up" onClick={startCheckIn}>
            Start check-in
          </Btn>
        </div>
      </Reveal>

      <div className="grid2">
        <Reveal d={0.05}>
          <BaselineCard
            data={{
              allergies: allergyLabel,
              conditions: conditionLabel,
              medications: medLabel,
              resolved: resolvedList,
            }}
            onViewAll={() => router.push("/profile")}
          />
        </Reveal>
        <Reveal d={0.1}>
          <VitalsCard />
        </Reveal>
        <Reveal d={0.15}>
          <RecentActivityCard
            events={recent}
            onOpenTimeline={() => router.push("/timeline")}
          />
        </Reveal>
        <Reveal d={0.2}>
          <UpcomingCard />
        </Reveal>
      </div>
    </div>
  );
}
