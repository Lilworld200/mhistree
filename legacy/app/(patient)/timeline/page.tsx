import { TimelineView } from "@/features/timeline/components/timeline-view";
import { AuthGuard } from "@/components/auth/auth-guard";

export default function Page() {
  return (
    <AuthGuard
      title="Health Timeline Protected"
      description="Please sign in or create an account to view your medical timeline and health history."
    >
      <TimelineView />
    </AuthGuard>
  );
}
