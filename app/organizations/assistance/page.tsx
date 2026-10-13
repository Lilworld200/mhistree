import { z } from "zod";
import { requirePatient } from "@/lib/auth/patient";
import { AssistanceView } from "@/features/identity/assistance-view";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ organization?: string }>;
}) {
  await requirePatient();
  return (
    <AssistanceView
      organizationId={z.uuid().parse((await searchParams).organization)}
    />
  );
}
