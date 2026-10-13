import { requirePatient } from "@/lib/auth/patient";
import { AppShell } from "@/components/layout/app-shell";
import Link from "next/link";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePatient();
  return (
    <AppShell>
      <nav aria-label="Restricted review">
        <Link href="/review">Professional review</Link>
        {" | "}
        <Link href="/review/organizations">Organization review</Link>
        {" | "}
        <Link href="/review/identity">Identity support</Link>
        {" | "}
        <Link href="/review/duplicates">Duplicate review</Link>
      </nav>
      {children}
    </AppShell>
  );
}
