import { requirePatient } from "@/lib/auth/patient";
import { database } from "@/lib/db/client";
import { practitionerToday } from "@/features/practitioner/daily";
import { TodayView } from "@/features/practitioner/today-view";
export default async function Page() {
  const { session } = await requirePatient();
  return (
    <TodayView
      initial={JSON.parse(
        JSON.stringify(await practitionerToday(database(), session)),
      )}
    />
  );
}
