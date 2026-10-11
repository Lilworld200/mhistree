import { requirePatient } from "@/lib/auth/patient";
import { database } from "@/lib/db/client";
import { reviewQueue } from "@/features/practitioner/profile";
import { ReviewView } from "@/features/practitioner/review-view";
export default async function Page() {
  const { session } = await requirePatient();
  return (
    <ReviewView
      initial={JSON.parse(
        JSON.stringify(await reviewQueue(database(), session)),
      )}
    />
  );
}
