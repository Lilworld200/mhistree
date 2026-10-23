import { requirePatient } from "@/lib/auth/patient";
import { database } from "@/lib/db/client";
import { directPatients } from "@/features/practitioner/patients";
import { PatientsView } from "@/features/practitioner/patients-view";
import { assignedPatients } from "@/features/organizations/assignments";
import { professionalProfile } from "@/features/practitioner/profile";
export default async function Page() {
  const { session } = await requirePatient();
  const { profile } = await professionalProfile(database(), session);
  const privileges: string[] =
    profile?.status === "approved" ? profile.privileges : [];
  return (
    <PatientsView
      capabilities={{
        lookup: privileges.includes("person.lookup"),
        register: privileges.includes("person.register"),
        connect: privileges.includes("records.write"),
      }}
      assigned={JSON.parse(
        JSON.stringify(await assignedPatients(database(), session)),
      )}
      initial={JSON.parse(
        JSON.stringify(await directPatients(database(), session)),
      )}
    />
  );
}
