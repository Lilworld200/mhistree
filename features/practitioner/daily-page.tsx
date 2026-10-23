import { redirect } from "next/navigation";
import { requirePatient } from "@/lib/auth/patient";
import { database } from "@/lib/db/client";
import { professionalProfile } from "./profile";
import { practitionerToday } from "./daily";
import { assignedPatients } from "@/features/organizations/assignments";
import { TodayView } from "./today-view";
import type { DailyView } from "./daily-types";

export async function PractitionerDailyPage({
  view = "dashboard",
}: {
  view?: DailyView;
}) {
  const { session } = await requirePatient();
  const pool = database(),
    { profile } = await professionalProfile(pool, session);
  if (profile?.status !== "approved") redirect("/clinician/profile");
  const [daily, assigned] = await Promise.all([
    practitionerToday(pool, session),
    assignedPatients(pool, session),
  ]);
  return (
    <TodayView
      view={view}
      initial={JSON.parse(JSON.stringify(daily))}
      assigned={JSON.parse(JSON.stringify(assigned))}
      canManageAppointments={profile.privileges.includes("appointments.manage")}
    />
  );
}
