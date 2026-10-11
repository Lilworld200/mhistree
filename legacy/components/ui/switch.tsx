"use client";

import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "@/lib/utils/cn";

export function Switch({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <SwitchPrimitive.Root
      role="switch"
      aria-checked={on}
      aria-label={label}
      data-state={on ? "checked" : "unchecked"}
      className={cn("sw", on && "on")}
      onCheckedChange={onChange}
    >
      <SwitchPrimitive.Thumb className="sw-thumb" />
    </SwitchPrimitive.Root>
  );
}
