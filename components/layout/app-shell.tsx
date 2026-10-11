"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Btn, IconBtn } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icons";
import logo from "@/app/assets/images/logos/mhistree_black_logo.png";

const navigation: { href: string; label: string; icon: IconName }[] = [
  { href: "/chat", label: "AI", icon: "chat" },
  { href: "/timeline", label: "Timeline", icon: "pulse" },
  { href: "/health", label: "Health", icon: "heart" },
  { href: "/documents", label: "Documents", icon: "doc" },
  { href: "/sharing", label: "Sharing", icon: "share" },
  { href: "/appointments", label: "Appointments", icon: "pulse" },
  { href: "/inbox", label: "Care inbox", icon: "chat" },
  { href: "/requests", label: "Requests and results", icon: "doc" },
];

function Navigation({ close }: { close?: () => void }) {
  const pathname = usePathname();
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
        <Link href="/chat" onClick={close}>
          Open chat
        </Link>
      </Btn>
      <nav className="nav-body" aria-label="Patient navigation">
        {navigation.map((item) => (
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
        <p className="glabel">Saved conversations are available in AI chat.</p>
      </nav>
      <Link href="/clinician/dashboard" onClick={close} className="nav-item">
        <Icon n="steth" s={17} />
        Clinician workspace
      </Link>
      <Btn asChild kind="dark">
        <Link href="/profile" onClick={close}>
          Your account
        </Link>
      </Btn>
    </>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
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
