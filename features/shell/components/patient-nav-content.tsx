"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Btn } from "@/components/ui/button";
import { Icon, Logo } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast-store";
import { AVATARS, PATIENT } from "@/lib/demo/people";
import { cn } from "@/lib/utils/cn";
import { useChatStore } from "@/features/chat/store";
import { PATIENT_NAV, SESSION_GROUPS } from "../config/navigation";

export function PatientNavContent({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const sessions = useChatStore((s) => s.sessions);
  const activeId = useChatStore((s) => s.activeSessionId);
  const newChat = useChatStore((s) => s.newChat);
  const openSession = useChatStore((s) => s.openSession);

  const go = (href: string) => {
    onClose?.();
    router.push(href);
  };

  return (
    <>
      <div className="brand">
        <Logo />
        <span>Mhistree</span>
        {onClose && (
          <button className="dx" onClick={onClose} aria-label="Close menu">
            <Icon n="x" s={16} />
          </button>
        )}
      </div>

      <Btn
        kind="dark"
        icon="plus"
        style={{ width: "100%", marginBottom: 14 }}
        onClick={() => {
          onClose?.();
          newChat();
          router.push("/chat");
        }}
      >
        New chat
      </Btn>

      {PATIENT_NAV.map((nv) => (
        <Link
          key={nv.href}
          href={nv.href}
          onClick={onClose}
          className={cn("nav-item", pathname === nv.href && "on")}
        >
          <Icon n={nv.icon} s={17} />
          {nv.label}
        </Link>
      ))}

      <Link
        href="/profile"
        onClick={onClose}
        className={cn("nav-item", pathname === "/profile" && "on")}
      >
        <Icon n="user" s={17} />
        Profile
      </Link>

      <div className="mlabel" style={{ margin: "14px 14px 6px" }}>
        RECENT CONVERSATIONS
      </div>
      <div className="recents">
        {SESSION_GROUPS.map((g) => {
          const list = sessions.filter((s) => s.group === g);
          if (!list.length) return null;
          return (
            <div key={g}>
              <div className="glabel">{g}</div>
              {list.map((s) => (
                <button
                  key={s.id}
                  className={cn(
                    "nav-item",
                    activeId === s.id && pathname === "/chat" && "on",
                  )}
                  onClick={() => {
                    onClose?.();
                    openSession(s.id);
                    router.push("/chat");
                  }}
                >
                  <Icon n="chat" s={14} />
                  <span className="ell">{s.title}</span>
                </button>
              ))}
            </div>
          );
        })}
      </div>

      <div className="sidefoot">
        <button className="nav-item" onClick={() => go("/clinician/dashboard")}>
          <Icon n="steth" s={17} />
          Clinician workspace
        </button>
        <Link href="/settings" onClick={onClose} className="nav-item">
          <Icon n="gear" s={17} />
          Settings
        </Link>
        <button
          className="nav-item"
          onClick={() => toast("Support: care@mhistree.app · replies < 24h", "chat")}
        >
          <Icon n="chat" s={17} />
          Help
        </button>
        <button
          className="nav-item"
          onClick={() => {
            onClose?.();
            toast("Signed out (demo)", "out");
          }}
        >
          <Icon n="out" s={17} />
          Sign out
        </button>
        <div className="prow" role="link" tabIndex={0} onClick={() => go("/profile")} onKeyDown={(e) => e.key === "Enter" && go("/profile")}>
          <Avatar img={AVATARS.nati} ring="#F4A8AC" size={36} name="Nati" />
          <div className="pmeta">
            <b>{PATIENT.name}</b>
            <span>Patient · O+</span>
          </div>
          <Icon n="chev" s={16} />
        </div>
      </div>
    </>
  );
}
