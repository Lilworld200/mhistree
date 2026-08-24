"use client";

import * as ToastPrimitive from "@radix-ui/react-toast";
import { Icon } from "./icons";
import { useToastStore } from "./toast-store";

/** Bottom-center toast stack (Radix a11y + prototype styling). */
export function ToastViewport() {
  const items = useToastStore((s) => s.items);
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <ToastPrimitive.Provider>
      {items.map((t) => (
        <ToastPrimitive.Root
          key={t.id}
          duration={2800}
          className="toast toast-enter"
          onOpenChange={(o) => {
            if (!o) dismiss(t.id);
          }}
        >
          <Icon n={t.icon} s={15} c="#7FB5FF" />
          <ToastPrimitive.Title>{t.text}</ToastPrimitive.Title>
        </ToastPrimitive.Root>
      ))}
      <ToastPrimitive.Viewport className="toasts" />
    </ToastPrimitive.Provider>
  );
}
