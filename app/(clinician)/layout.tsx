"use client";

import { AppShell } from "@/features/shell/components/app-shell";
import { ClinicianNavContent } from "@/features/shell/components/clinician-nav-content";

export default function ClinicianLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell renderNav={(onClose) => <ClinicianNavContent onClose={onClose} />}>
      {children}
    </AppShell>
  );
}
