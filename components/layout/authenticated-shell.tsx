import { redirect } from "next/navigation";
import { requirePatient } from "@/lib/auth/patient";
import { workspaceAccess } from "@/features/auth/workspace-access";
import { database } from "@/lib/db/client";
import { AppShell } from "./app-shell";

export async function AuthenticatedShell({
  children,
  area,
}: {
  children: React.ReactNode;
  area?: "practitioner" | "organization";
}) {
  const loginPath = area ? `/auth/professional/${area}` : "/auth";
  const { session } = await requirePatient(loginPath);
  const workspaces = await workspaceAccess(database(), session);
  if (area === "practitioner" && !workspaces.professionalProfile)
    redirect(loginPath);
  if (area === "organization" && !workspaces.organizations) redirect(loginPath);
  return <AppShell workspaces={workspaces}>{children}</AppShell>;
}
