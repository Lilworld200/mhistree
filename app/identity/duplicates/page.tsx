import { requirePatient } from "@/lib/auth/patient";
import { DuplicateFlagView } from "@/features/identity/duplicates-view";
import { AuthenticatedShell } from "@/components/layout/authenticated-shell";
export default async function Page() {
  const { actor } = await requirePatient();
  return (
    <AuthenticatedShell>
      <DuplicateFlagView personId={actor.personId} />
    </AuthenticatedShell>
  );
}
