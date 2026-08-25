"use client";

import { useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { Btn } from "@/components/ui/button";
import { Icon } from "@/components/ui/icons";
import { cn } from "@/lib/utils/cn";
import { useChatStore } from "@/features/chat/store";
import { PATIENT_NAV, SESSION_GROUPS } from "../config/navigation";
import { useShellStore } from "../store";

import logoBlack from "@/app/assets/images/logos/mhistree_black_logo.png";
import logoWhite from "@/app/assets/images/logos/mhistree_white_logo.png";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function PatientNavContent({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const theme = useShellStore((s) => s.theme);
  const sessions = useChatStore((s) => s.sessions);
  const activeId = useChatStore((s) => s.activeSessionId);
  const newChat = useChatStore((s) => s.newChat);
  const openSession = useChatStore((s) => s.openSession);
  const fetchHistory = useChatStore((s) => s.fetchHistory);
  const loaded = useChatStore((s) => s.loaded);

  const [user, setUser] = useState<{
    email?: string;
    first_name?: string;
  } | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setUser({
          email: data.user.email,
          first_name: data.user.user_metadata?.first_name || "Patient",
        });
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({
          email: session.user.email,
          first_name: session.user.user_metadata?.first_name || "Patient",
        });
      } else {
        setUser(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    setUser(null);
    onClose?.();
    router.push("/chat");
  };

  useEffect(() => {
    if (!loaded) {
      fetchHistory();
    }
  }, [loaded, fetchHistory]);

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
          {sessions.length === 0 ? (
            <div
              className="glabel"
              style={{ fontStyle: "italic", opacity: 0.7 }}
            >
              No chat sessions
            </div>
          ) : (
            SESSION_GROUPS.map((g) => {
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
            })
          )}
        </div>
      </div>
      <div className="sidefoot">
        <button className="nav-item" onClick={() => go("/clinician/dashboard")}>
          <Icon n="steth" s={17} />
          Clinician workspace
        </button>

        {user ? (
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
              <Avatar ring="#F4A8AC" size={36} name={user.first_name || "P"} />
              <div className="pmeta">
                <b>{user.first_name || "Patient Profile"}</b>
                <span>{user.email || "Health Record"}</span>
              </div>
            </div>
            <button
              className="btn btn-icon btn-ghost"
              style={{
                width: 36,
                height: 36,
                minWidth: 36,
                borderRadius: "50%",
              }}
              title="Sign Out"
              aria-label="Sign Out"
              onClick={handleSignOut}
            >
              <Icon n="out" s={18} />
            </button>
          </div>
        ) : (
          <Btn
            kind="dark"
            style={{
              width: "100%",
              marginTop: "8px",
              justifyContent: "center",
            }}
            onClick={() => go("/auth")}
          >
            Sign In / Sign Up
          </Btn>
        )}
      </div>
    </>
  );
}
