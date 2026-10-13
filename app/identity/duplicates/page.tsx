import { requirePatient } from "@/lib/auth/patient";
import { DuplicateFlagView } from "@/features/identity/duplicates-view";
import { AppShell } from "@/components/layout/app-shell";
export default async function Page() {
  const { actor } = await requirePatient();
  return (
    <AppShell>
      <DuplicateFlagView personId={actor.personId} />
    </AppShell>
  );
}
