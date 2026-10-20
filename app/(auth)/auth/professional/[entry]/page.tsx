import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AccountEntry } from "@/features/patient/account/entry";
import { professionalEntry } from "@/features/auth/entry-path";
import { currentPatient } from "@/lib/auth/patient";
import { professionalProfile } from "@/features/practitioner/profile";
import { ProfessionalProfile } from "@/features/practitioner/profile-view";
import { myOrganizations } from "@/features/organizations/server";
import { OrganizationView } from "@/features/organizations/view";
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
  if (!patient) return <AccountEntry entry={parsed.data} />;
  const { session } = patient;
  const pool = database();
  if (parsed.data === "practitioner") {
    const profile = await professionalProfile(pool, session);
    if (profile.profile?.status === "approved")
      redirect("/clinician/dashboard");
    return (
      <main className="account-stage">
        <section className="account-card professional-enrollment">
          <ProfessionalProfile initial={JSON.parse(JSON.stringify(profile))} />
          <p className="account-navigation">
            <Link href="/auth/professional">Professional options</Link> ·{" "}
            <Link href="/chat">Your health account</Link>
          </p>
        </section>
      </main>
    );
  }
  return (
    <main className="account-stage">
      <section className="account-card professional-enrollment">
        <OrganizationView
          initial={JSON.parse(
            JSON.stringify(await myOrganizations(pool, session)),
          )}
        />
        <p className="account-navigation">
          <Link href="/organizations">Organization workspace</Link> ·{" "}
          <Link href="/organizations/staff">Team invitations</Link> ·{" "}
          <Link href="/auth/professional">Professional options</Link> ·{" "}
          <Link href="/chat">Your health account</Link>
        </p>
      </section>
    </main>
  );
}
