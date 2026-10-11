import { requirePatient } from "@/lib/auth/patient";
import { database } from "@/lib/db/client";
import { directPatients } from "@/features/practitioner/patients";
import { PatientsView } from "@/features/practitioner/patients-view";
export default async function Page() {
  const { session } = await requirePatient();
  return (
    <PatientsView
      initial={JSON.parse(
        JSON.stringify(await directPatients(database(), session)),
      )}
    />
  );
}
