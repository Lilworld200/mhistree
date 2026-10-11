"use client";

import { AppShell } from "@/features/shell/components/app-shell";
import { PatientNavContent } from "@/features/shell/components/patient-nav-content";

export default function PatientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell renderNav={(onClose) => <PatientNavContent onClose={onClose} />}>
      {children}
    </AppShell>
  );
}
