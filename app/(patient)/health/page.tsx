import { HealthView } from "@/features/health/components/health-view";
import { AuthGuard } from "@/components/auth/auth-guard";

export default function Page() {
  return (
    <AuthGuard
      title="Health Metrics & Vitals Protected"
      description="Please sign in or create an account to view and manage your longitudinal health record and vitals."
    >
      <HealthView />
    </AuthGuard>
  );
}
