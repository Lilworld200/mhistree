import { redirect } from "next/navigation";
import { requirePatient } from "@/lib/auth/patient";
import { database } from "@/lib/db/client";
import { professionalProfile } from "./profile";
import { practitionerToday } from "./daily";
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
  const now = new Date();
  const range =
    view === "schedule"
      ? {
          from: new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0),
          ).toISOString(),
          to: new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 2),
          ).toISOString(),
        }
      : undefined;
  const daily = range
    ? await practitionerToday(pool, session, range)
    : await practitionerToday(pool, session);
  return (
    <TodayView
      view={view}
      initial={JSON.parse(JSON.stringify(daily))}
      canManageAppointments={profile.privileges.includes("appointments.manage")}
    />
  );
}
