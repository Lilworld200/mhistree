import { requirePatient } from "@/lib/auth/patient";
import { database } from "@/lib/db/client";
import { duplicateQueue } from "@/features/identity/duplicates";
import { DuplicateReviewView } from "@/features/identity/duplicates-view";
export default async function Page() {
  const { session } = await requirePatient();
  return (
    <DuplicateReviewView
      initial={JSON.parse(
        JSON.stringify(await duplicateQueue(database(), session)),
      )}
    />
  );
}
