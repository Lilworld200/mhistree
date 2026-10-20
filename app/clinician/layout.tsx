import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthenticatedShell area="practitioner">{children}</AuthenticatedShell>
  );
}
