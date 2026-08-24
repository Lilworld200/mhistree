"use client";

import { useRouter } from "next/navigation";
import { Btn, IconBtn } from "@/components/ui/button";
import { Reveal } from "@/components/ui/reveal";
import { useAiAssistantStore } from "@/features/ai-assistant/store";
import { useChatStore } from "@/features/chat/store";
import { useTimelineStore } from "@/features/timeline/store";
import { BaselineCard } from "./baseline-card";
import { HealthHero } from "./health-hero";
import { RecentActivityCard } from "./recent-activity-card";
import { UpcomingCard } from "./upcoming-card";
import { VitalsCard } from "./vitals-card";

export function HealthView() {
  const router = useRouter();
  const events = useTimelineStore((s) => s.events);
  const recent = events.slice(0, 3);
  const openAssistant = useAiAssistantStore((s) => s.open);

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
          <BaselineCard onViewAll={() => router.push("/profile")} />
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
