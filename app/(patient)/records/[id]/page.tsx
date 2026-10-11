import { requirePatient } from "@/lib/auth/patient";
import { database } from "@/lib/db/client";
import { readContribution } from "@/features/health-records/server";
import { RecordCard } from "@/features/health-records/timeline-view";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { session } = await requirePatient();
  const { id } = await params;
  const record = await readContribution(
    database(),
    session,
    { kind: "patient" },
    id,
  );
  return (
    <section className="patient-view">
      <h1>Source-linked record</h1>
      <RecordCard record={JSON.parse(JSON.stringify(record))} />
    </section>
  );
}
