import { requirePatient } from "@/lib/auth/patient";
import { database } from "@/lib/db/client";
import { professionalProfile } from "@/features/practitioner/profile";
import { ProfessionalProfile } from "@/features/practitioner/profile-view";
export default async function Page() {
  const { session } = await requirePatient();
  return (
    <ProfessionalProfile
      initial={JSON.parse(
        JSON.stringify(await professionalProfile(database(), session)),
      )}
    />
  );
}
