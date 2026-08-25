import { PatientsView } from "@/features/clinician/components/patients-view";
import { AuthGuard } from "@/components/auth/auth-guard";

export default function Page() {
  return (
    <AuthGuard
      title="Clinician Patient Roster Protected"
      description="Please sign in with your clinician credentials to view patient medical histories and management options."
    >
      <PatientsView />
    </AuthGuard>
  );
}
