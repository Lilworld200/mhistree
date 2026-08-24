"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Btn } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { AVATARS, PATIENT } from "@/lib/demo/people";
import { cn } from "@/lib/utils/cn";
import { useChatStore } from "@/features/chat/store";
import { PATIENT_NAV, SESSION_GROUPS } from "../config/navigation";
import { useShellStore } from "../store";

import logoBlack from "@/app/assets/images/logos/mhistree_black_logo.png";
import logoWhite from "@/app/assets/images/logos/mhistree_white_logo.png";

export function PatientNavContent({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const theme = useShellStore((s) => s.theme);
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
        <Image
          src={theme === "dark" ? logoWhite : logoBlack}
          alt="Mhistree"
          height={60}
          style={{ height: 60, width: 175, objectFit: "contain" }}
          priority
        />
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
      <div className="nav-body">
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
      </div>
      <div className="sidefoot">
        <button className="nav-item" onClick={() => go("/clinician/dashboard")}>
          <Icon n="steth" s={17} />
          Clinician workspace
        </button>
        <div
          className="prow-container"
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <div
            className="prow"
            style={{ flex: 1 }}
            role="link"
            tabIndex={0}
            onClick={() => go("/profile")}
            onKeyDown={(e) => e.key === "Enter" && go("/profile")}
          >
            <Avatar img={AVATARS.nati} ring="#F4A8AC" size={36} name="Nati" />
            <div className="pmeta">
              <b>{PATIENT.name}</b>
              <span>Patient · O+</span>
            </div>
          </div>
          <button
            className="btn btn-icon btn-ghost"
            style={{ width: 36, height: 36, minWidth: 36, borderRadius: "50%" }}
            title="Settings"
            aria-label="Settings"
            onClick={() => go("/settings")}
          >
            <Icon n="gear" s={18} />
          </button>
        </div>
      </div>
    </>
  );
}
