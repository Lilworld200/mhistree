import { requirePatient } from "@/lib/auth/patient";
import { database } from "@/lib/db/client";
import { directWorkspace } from "@/features/practitioner/workspace";
import { PatientDetailView } from "@/features/practitioner/patient-detail-view";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { session } = await requirePatient();
  const { id } = await params;
  const initialData = await directWorkspace(database(), session, id, "profile");
  return (
    <PatientDetailView key={id} connectionId={id} initialData={initialData} />
  );
}
