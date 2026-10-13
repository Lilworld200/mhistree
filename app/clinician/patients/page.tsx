import { requirePatient } from "@/lib/auth/patient";
import { database } from "@/lib/db/client";
import { directPatients } from "@/features/practitioner/patients";
import { PatientsView } from "@/features/practitioner/patients-view";
import { assignedPatients } from "@/features/organizations/assignments";
export default async function Page() {
  const { session } = await requirePatient();
  return (
    <PatientsView
      assigned={JSON.parse(
        JSON.stringify(await assignedPatients(database(), session)),
      )}
      initial={JSON.parse(
        JSON.stringify(await directPatients(database(), session)),
      )}
    />
  );
}
