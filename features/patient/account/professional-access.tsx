import { redirect } from "next/navigation";
import { currentPatient } from "@/lib/auth/patient";
import {
  professionalEntry,
  professionalEntryPath,
} from "@/features/auth/entry-path";
import { ProfessionalAuthForm } from "@/features/professional-onboarding/auth-form";
export type ProfessionalSearch = {
  entry?: string | string[];
  verification?: string | string[];
};
export async function ProfessionalAccess({
  query,
}: {
  query: ProfessionalSearch;
}) {
  const parsed = professionalEntry.safeParse(query.entry);
  const entry = parsed.success ? parsed.data : "practitioner";
  if (await currentPatient()) redirect(professionalEntryPath(entry));
  return (
    <ProfessionalAuthForm
      key={entry}
      entry={entry}
      verificationPending={query.verification === "pending"}
    />
  );
}
