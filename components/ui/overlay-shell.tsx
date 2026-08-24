"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AnimatePresence, motion } from "motion/react";
import React from "react";
import { cn } from "@/lib/utils/cn";
import { Icon } from "./icons";

/**
 * Single accessible overlay primitive for every modal/sheet in the app.
 * Radix Dialog owns focus trapping, Escape, scroll locking and ARIA;
 * motion owns the exact prototype spring animations.
 *
 * Variants:
 *  - center  → floating rounded panel (modals)
 *  - right   → right-hand sheet (drawers)
 *  - left    → left-hand sheet (mobile nav drawer)
 */
export type OverlayVariant = "center" | "right" | "left";

const SPRINGS = {
  center: { type: "spring", damping: 26, stiffness: 320 },
  side: { type: "spring", damping: 30, stiffness: 300 },
} as const;

export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export function OverlayShell({
  open,
  onClose,
  title,
  variant = "right",
  width,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the dialog (rendered visually hidden). */
  title: string;
  variant?: OverlayVariant;
  /** Optional max width in px (center panels / wide drawers). */
  width?: number;
  children?: React.ReactNode;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div
                className={cn("scrim", variant === "center" && "scrim-center")}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                className={cn(
                  variant === "center" && "modal-panel",
                  variant === "right" && "drawer-panel",
                  variant === "left" && "drawer-left",
                )}
                style={
                  width && variant !== "left"
                    ? { width: `min(${width}px, 94vw)` }
                    : undefined
                }
                initial={
                  variant === "center"
                    ? { opacity: 0, scale: 0.94, y: 14 }
                    : { x: variant === "right" ? "110%" : "-100%" }
                }
                animate={
                  variant === "center"
                    ? { opacity: 1, scale: 1, y: 0 }
                    : { x: 0 }
                }
                exit={
                  variant === "center"
                    ? { opacity: 0, scale: 0.96, y: 8 }
                    : { x: variant === "right" ? "110%" : "-100%" }
                }
                transition={variant === "center" ? SPRINGS.center : SPRINGS.side}
              >
                <Dialog.Title className="sr-only">{title}</Dialog.Title>
                {children}
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

/** Standard drawer/modal header row. Pass a pre-styled title node. */
export function OverlayHead({
  title,
  onClose,
}: {
  title: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="dhead">
      {title}
      <button
        className="btn btn-icon btn-ghost"
        style={{ width: 36, height: 36 }}
        aria-label="Close"
        onClick={onClose}
      >
        <Icon n="x" s={16} />
      </button>
    </div>
  );
}
