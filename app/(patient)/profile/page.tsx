import { requirePatient } from "@/lib/auth/patient";
import { accountProfile } from "@/features/patient/account/server";
import { ProfileView } from "@/features/patient/account/profile";
import { database } from "@/lib/db/client";
import { workspaceAccess } from "@/features/auth/workspace-access";
export default async function Profile({
  searchParams,
}: {
  searchParams: Promise<{ workspace?: string | string[] }>;
}) {
  const { session } = await requirePatient();
  const pool = database();
  const [profile, access, query] = await Promise.all([
    accountProfile(pool, session),
    workspaceAccess(pool, session),
    searchParams,
  ]);
  return (
    <ProfileView
      initial={JSON.parse(JSON.stringify(profile))}
      canSwitchWorkspace={access.practitioner}
      currentWorkspace={
        access.practitioner && query.workspace === "practitioner"
          ? "practitioner"
          : "personal"
      }
    />
  );
}
