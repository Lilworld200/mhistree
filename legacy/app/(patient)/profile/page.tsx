import { ProfileView } from "@/features/profile/components/profile-view";
import { AuthGuard } from "@/components/auth/auth-guard";

export default function Page() {
  return (
    <AuthGuard
      title="Patient Profile Protected"
      description="Please sign in or create an account to view and update your personal medical profile."
    >
      <ProfileView />
    </AuthGuard>
  );
}
