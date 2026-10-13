import { z } from "zod";
import { requirePatient } from "@/lib/auth/patient";
import { WorkspaceView } from "@/features/practitioner/workspace-view";
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{
    connection?: string;
    organization?: string;
    assignment?: string;
    basis?: string;
  }>;
}) {
  await requirePatient();
  const p = await searchParams;
  const organizationId = z.uuid().parse(p.organization),
    assignmentId = z.uuid().parse(p.assignment);
  const context = p.basis
    ? {
        kind: "initial-care" as const,
        basisId: z.uuid().parse(p.basis),
        organizationId,
        assignmentId,
      }
    : {
        kind: "organization" as const,
        connectionId: z.uuid().parse(p.connection),
        organizationId,
        assignmentId,
      };
  return (
    <WorkspaceView
      key={JSON.stringify(context)}
      connectionId={p.connection ?? ""}
      organizationContext={context}
    />
  );
}
