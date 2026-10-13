import { z } from "zod";
import { requirePatient } from "@/lib/auth/patient";
import { StaffView } from "@/features/organizations/staff-view";
import { organizationStaff } from "@/features/organizations/membership";
import { database } from "@/lib/db/client";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ organization?: string }>;
}) {
  const { session } = await requirePatient();
  const { organization } = await searchParams;
  if (organization)
    await organizationStaff(database(), session, z.uuid().parse(organization));
  return <StaffView organizationId={organization} />;
}
