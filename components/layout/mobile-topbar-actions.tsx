"use client";
import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const MobileTopbarTarget = createContext<HTMLElement | null>(null);

/** Page-owned actions render in the shell's existing mobile top bar. */
export function MobileTopbarActions({ children }: { children: ReactNode }) {
  const target = useContext(MobileTopbarTarget);
  return target ? createPortal(children, target) : null;
}
