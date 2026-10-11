import { SharingView } from "@/features/sharing/components/sharing-view";
import { AuthGuard } from "@/components/auth/auth-guard";

export default function Page() {
  return (
    <AuthGuard
      title="Document & Record Sharing Protected"
      description="Please sign in or create an account to share health records with family members or clinicians."
    >
      <SharingView />
    </AuthGuard>
  );
}
