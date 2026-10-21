import { notFound, redirect } from "next/navigation";
import {
  professionalEntry,
  professionalAuthPath,
} from "@/features/auth/entry-path";
import { currentPatient } from "@/lib/auth/patient";
import { professionalProfile } from "@/features/practitioner/profile";
import { myOrganizations } from "@/features/organizations/server";
import { ApplicationFlow } from "@/features/professional-onboarding/application";
import { database } from "@/lib/db/client";
export const metadata = { title: "Professional account access" };
export default async function Page({
  params,
}: {
  params: Promise<{ entry: string }>;
}) {
  const parsed = professionalEntry.safeParse((await params).entry);
  if (!parsed.success) notFound();
  const patient = await currentPatient();
  if (!patient) redirect(professionalAuthPath(parsed.data, "signup"));
  const { session } = patient;
  const pool = database();
  if (parsed.data === "practitioner") {
    const profile = await professionalProfile(pool, session);
    if (profile.profile?.status === "approved")
      redirect("/clinician/dashboard");
    return (
      <ApplicationFlow
        entry="practitioner"
        initialProfile={JSON.parse(JSON.stringify(profile))}
      />
    );
  }
  return (
    <ApplicationFlow
      entry="organization"
      initialOrganizations={JSON.parse(
        JSON.stringify(await myOrganizations(pool, session)),
      )}
    />
  );
}
