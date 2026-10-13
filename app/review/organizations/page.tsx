import { requirePatient } from "@/lib/auth/patient";
import { database } from "@/lib/db/client";
import { organizationReviewQueue } from "@/features/organizations/server";
import { OrganizationView } from "@/features/organizations/view";
export default async function Page() {
  const { session } = await requirePatient();
  return (
    <OrganizationView
      review
      initial={JSON.parse(
        JSON.stringify(await organizationReviewQueue(database(), session)),
      )}
    />
  );
}
