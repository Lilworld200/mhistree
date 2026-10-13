import { requirePatient } from "@/lib/auth/patient";
import { AppShell } from "@/components/layout/app-shell";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requirePatient();
  return <AppShell>{children}</AppShell>;
}
