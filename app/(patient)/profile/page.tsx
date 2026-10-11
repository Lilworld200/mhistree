import { requirePatient } from "@/lib/auth/patient";
import { accountProfile } from "@/features/patient/account/server";
import { ProfileView } from "@/features/patient/account/profile";
import { database } from "@/lib/db/client";
export default async function Profile() {
  const { session } = await requirePatient();
  return (
    <ProfileView
      initial={JSON.parse(
        JSON.stringify(await accountProfile(database(), session)),
      )}
    />
  );
}
