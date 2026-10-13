import { z } from "zod";
import { requirePatient } from "@/lib/auth/patient";
import { database, transaction } from "@/lib/db/client";
import { requireOrganization } from "@/features/organizations/server";
import { OrganizationRegistration } from "@/features/organizations/registration-view";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ organization?: string }>;
}) {
  const { session } = await requirePatient();
  const id = z.uuid().parse((await searchParams).organization);
  await transaction(
    (tx) => requireOrganization(tx, session, id, "person.register"),
    database(),
  );
  return <OrganizationRegistration organizationId={id} />;
}
