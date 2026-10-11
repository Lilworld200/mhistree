import { PatientRecordView } from "@/features/clinician/components/patient-record-view";

export default async function Page({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  return <PatientRecordView patientId={patientId} />;
}
