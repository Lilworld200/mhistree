"use client";

import { ToastViewport } from "@/components/ui/toast";
import { CommandMenu } from "@/features/shell/components/command-menu";
import { AiDrawer } from "@/features/ai-assistant/components/ai-drawer";
import { EvidenceDrawer } from "@/features/timeline/components/evidence-drawer";
import { CorrectionDialog } from "@/features/timeline/components/correction-dialog";
import { ShareWizard } from "@/features/sharing/components/share-wizard";
import { LeaseDrawer } from "@/features/sharing/components/lease-drawer";
import { DocViewerDrawer } from "@/features/documents/components/document-viewer-drawer";

/**
 * Global overlay host. Every cross-page drawer/modal/toast is mounted
 * once here; each reads its open-state from its owning feature store,
 * so they cost nothing while closed.
 */
export function AppOverlays() {
  return (
    <>
      <ToastViewport />
      <CommandMenu />
      <AiDrawer />
      <EvidenceDrawer />
      <CorrectionDialog />
      <ShareWizard />
      <LeaseDrawer />
      <DocViewerDrawer />
    </>
  );
}
