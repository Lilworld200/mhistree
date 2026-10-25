import { requirePatient } from "@/lib/auth/patient";
import { database } from "@/lib/db/client";
import {
  directPatientCards,
  assignedPatientCards,
} from "@/features/practitioner/patient-overview";
import { PatientsView } from "@/features/practitioner/patients-view";
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
        JSON.stringify(await assignedPatientCards(database(), session)),
      )}
      initial={JSON.parse(
        JSON.stringify(await directPatientCards(database(), session)),
      )}
    />
  );
}
