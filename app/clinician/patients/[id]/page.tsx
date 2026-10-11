import { requirePatient } from "@/lib/auth/patient";
import { database } from "@/lib/db/client";
import { directWorkspace } from "@/features/practitioner/workspace";
import { WorkspaceView } from "@/features/practitioner/workspace-view";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { session } = await requirePatient();
  const { id } = await params;
  await directWorkspace(database(), session, id);
  return <WorkspaceView connectionId={id} />;
}
