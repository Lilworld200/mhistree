"use client";

import { Slot, Slottable } from "@radix-ui/react-slot";
import * as Tooltip from "@radix-ui/react-tooltip";
import React from "react";
import { cn } from "@/lib/utils/cn";
import { Icon, type IconName } from "./icons";

type BtnProps = {
  kind?: "soft" | "dark";
  sm?: boolean;
  icon?: IconName;
  asChild?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

export function Btn({
  kind = "soft",
  sm,
  icon,
  asChild,
  className,
  children,
  ...rest
}: BtnProps) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn("btn", `btn-${kind}`, sm && "btn-sm", className)}
      {...rest}
    >
      {icon && <Icon n={icon} s={sm ? 15 : 17} />}
      <Slottable>{children}</Slottable>
    </Comp>
  );
}

type IconBtnProps = {
  icon: IconName;
  size?: number;
  ghost?: boolean;
  /** Shows an accessible label + styled tooltip */
  title?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "title">;

export function IconBtn({
  icon,
  size = 46,
  ghost,
  title,
  className,
  style,
  type = "button",
  ...rest
}: IconBtnProps) {
  const btn = (
    <button
      type={type}
      aria-label={title}
      className={cn("btn btn-icon", ghost && "btn-ghost", className)}
      style={{ width: size, height: size, ...style }}
      {...rest}
    >
      <Icon n={icon} s={Math.round(size * 0.42)} />
    </button>
  );
  if (!title) return btn;
  return (
    <Tooltip.Provider delayDuration={250}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>{btn}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="tooltip-content" sideOffset={6}>
            {title}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
