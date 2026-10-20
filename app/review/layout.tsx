import { requirePatient } from "@/lib/auth/patient";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
import Link from "next/link";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePatient();
  return (
    <AuthenticatedShell>
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
    </AuthenticatedShell>
  );
}
