import { AppShell } from "@/components/layout/app-shell";
import { requirePatient } from "@/lib/auth/patient";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePatient();
  return <AppShell>{children}</AppShell>;
}
