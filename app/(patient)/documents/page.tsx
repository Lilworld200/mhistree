import { DocumentsView } from "@/features/documents/components/documents-view";
import { AuthGuard } from "@/components/auth/auth-guard";

export default function Page() {
  return (
    <AuthGuard
      title="Documents & Medical Files Protected"
      description="Please sign in or create an account to view and upload lab results and clinical documents."
    >
      <DocumentsView />
    </AuthGuard>
  );
}
