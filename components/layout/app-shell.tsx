"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Btn, IconBtn } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icons";
import logo from "@/app/assets/images/logos/mhistree_black_logo.png";

import { ChatNavigationProvider, useChatNavigation } from "./chat-navigation";

const navigation: { href: string; label: string; icon: IconName }[] = [
  { href: "/chat", label: "AI", icon: "chat" },
  { href: "/timeline", label: "Timeline", icon: "pulse" },
  { href: "/health", label: "Health", icon: "heart" },
  { href: "/documents", label: "Documents", icon: "doc" },
  { href: "/sharing", label: "Sharing", icon: "share" },
  { href: "/appointments", label: "Appointments", icon: "cal" },
  { href: "/inbox", label: "Care inbox", icon: "chat" },
  { href: "/requests", label: "Requests and results", icon: "doc" },
];

function Navigation({ close }: { close?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const chat = useChatNavigation();
  return (
    <>
      <div className="brand">
        <Image
          src={logo}
          alt="Mhistree"
          height={60}
          style={{ height: 60, width: 175, objectFit: "contain" }}
          priority
        />
        {close && (
          <Dialog.Close
            className="btn btn-icon"
            style={{ width: 44, height: 44 }}
            aria-label="Close menu"
          >
            <Icon n="x" s={18} />
          </Dialog.Close>
        )}
      </div>
      <Btn
        kind="dark"
        icon="plus"
        asChild
        style={{ width: "100%", marginBottom: 14 }}
      >
        <Link
          href="/chat"
          onClick={(event) => {
            if (chat?.navigation.busy) {
              event.preventDefault();
              return;
            }
            chat?.select("");
            close?.();
          }}
        >
          New chat
        </Link>
      </Btn>
      <nav className="nav-body" aria-label="Patient navigation">
        {navigation.slice(0, 5).map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={close}
            className={`nav-item${pathname === item.href ? " on" : ""}`}
            aria-current={pathname === item.href ? "page" : undefined}
          >
            <Icon n={item.icon} s={17} />
            {item.label}
          </Link>
        ))}
        <div className="mlabel recent-heading">RECENT CONVERSATIONS</div>
        <div className="recents">
          {!chat?.navigation.conversations.length && (
            <p className="glabel">Your conversations appear here.</p>
          )}
          {chat?.navigation.conversations.map((conversation) => (
            <button
              key={conversation.id}
              className={`nav-item${pathname === "/chat" && chat.navigation.selected === conversation.id ? " on" : ""}`}
              disabled={chat.navigation.busy}
              onClick={() => {
                chat.select(conversation.id);
                close?.();
                router.push("/chat");
              }}
            >
              <Icon n="chat" s={14} />
              <span className="ell">
                {new Date(conversation.created_at).toLocaleDateString(
                  undefined,
                  { month: "short", day: "numeric" },
                )}{" "}
                conversation
              </span>
            </button>
          ))}
        </div>
        <details
          className="sidebar-care"
          open={
            navigation.slice(5).some((item) => item.href === pathname) ||
            undefined
          }
        >
          <summary className="nav-item">
            <Icon n="cal" s={17} />
            Care and appointments
          </summary>
          {navigation.slice(5).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={close}
              className={`nav-item${pathname === item.href ? " on" : ""}`}
              aria-current={pathname === item.href ? "page" : undefined}
            >
              <Icon n={item.icon} s={17} />
              {item.label}
            </Link>
          ))}
        </details>
      </nav>
      <div className="sidefoot">
        <Link href="/clinician/dashboard" onClick={close} className="nav-item">
          <Icon n="steth" s={17} />
          Clinician workspace
        </Link>
        <Link href="/organizations" onClick={close} className="nav-item">
          <Icon n="share" s={17} />
          Organizations
        </Link>
        <Link href="/profile" onClick={close} className="prow">
          <span className="profile-avatar">
            <Icon n="user" s={18} />
          </span>
          <span className="pmeta">
            <b>Your account</b>
            <span>Profile and account controls</span>
          </span>
          <Icon n="chev" s={16} />
        </Link>
      </div>
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ChatNavigationProvider>
      <Shell>{children}</Shell>
    </ChatNavigationProvider>
  );
}
function Shell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const title =
    pathname === "/chat"
      ? "Conversation"
      : (navigation.find((item) => item.href === pathname)?.label ??
        "Mhistree");
  return (
    <div className="app" data-theme="light">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Dialog.Root open={open} onOpenChange={setOpen}>
        <div className="stage">
          <div className="topbar">
            <Dialog.Trigger asChild>
              <IconBtn icon="menu" size={44} title="Open menu" />
            </Dialog.Trigger>
            <span className="tbtitle">{title}</span>
            <span style={{ width: 44 }} />
          </div>
          <aside className="side">
            <Navigation />
          </aside>
          <main className="main-shell" id="main-content" tabIndex={-1}>
            <div className="page">{children}</div>
          </main>
        </div>
        <Dialog.Portal>
          <Dialog.Overlay className="foundation-scrim" />
          <Dialog.Content className="drawer-left">
            <Dialog.Title className="sr-only">Navigation</Dialog.Title>
            <Dialog.Description className="sr-only">
              Choose a Mhistree section.
            </Dialog.Description>
            <Navigation close={() => setOpen(false)} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
