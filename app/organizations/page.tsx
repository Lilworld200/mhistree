import { requirePatient } from "@/lib/auth/patient";
import { database } from "@/lib/db/client";
import { myOrganizations } from "@/features/organizations/server";
import { OrganizationView } from "@/features/organizations/view";
export default async function Page() {
  const { session } = await requirePatient();
  return (
    <OrganizationView
      initial={JSON.parse(
        JSON.stringify(await myOrganizations(database(), session)),
      )}
    />
  );
}
