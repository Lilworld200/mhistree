"use client";

import { IconBtn } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast-store";

export function ChatHeader({ title }: { title: string }) {
  return (
    <header className="chead">
      <div>
        <div className="ctitle">{title}</div>
        <div className="csub">New session · continuity from long-term memory</div>
      </div>
      <span className="hpill hpill-dark" style={{ marginLeft: "auto" }}>
        <Icon n="shield" s={13} />
        Health context on
      </span>
      <IconBtn
        ghost
        icon="bell"
        size={40}
        title="Notifications"
        onClick={() => toast("No new notifications", "bell")}
      />
    </header>
  );
}
