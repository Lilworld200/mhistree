"use client";
import { useRef, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Icon } from "./icons";

export function SidePanel({
  title,
  description,
  onClose,
  returnFocus,
  children,
}: {
  title: string;
  description: string;
  onClose: () => void;
  returnFocus?: () => HTMLElement | null;
  children: ReactNode;
}) {
  const previousFocus = useRef(
    typeof document !== "undefined"
      ? (document.activeElement as HTMLElement)
      : null,
  );
  return (
    <Dialog.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="foundation-scrim" />
        <Dialog.Content
          className="sharing-panel"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            (returnFocus?.() ?? previousFocus.current)?.focus();
          }}
        >
          <header className="sharing-panel-header">
            <div>
              <Dialog.Title>{title}</Dialog.Title>
              <Dialog.Description>{description}</Dialog.Description>
            </div>
            <Dialog.Close className="btn btn-icon" aria-label="Close panel">
              <Icon n="x" />
            </Dialog.Close>
          </header>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
