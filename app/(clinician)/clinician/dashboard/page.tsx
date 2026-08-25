import { DashboardView } from "@/features/clinician/components/dashboard-view";
import { AuthGuard } from "@/components/auth/auth-guard";

export default function Page() {
  return (
    <AuthGuard
      title="Clinician Workspace Protected"
      description="Please sign in with your authorized clinician credentials to access the clinical dashboard and patient records."
    >
      <DashboardView />
    </AuthGuard>
  );
}
