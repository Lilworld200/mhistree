"use client";
import { useEffect, useRef } from "react";

/** Keep an overlaying mobile keyboard inside the same shell sizing contract. */
export function useAppViewport() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = root.current;
    const viewport = window.visualViewport;
    if (!element || !viewport) return;
    const update = () => {
      // Pinch zoom must magnify the existing layout, rather than reflowing it.
      if (viewport.scale !== 1) {
        element.style.removeProperty("--app-viewport-height");
        return;
      }
      const height = Math.min(window.innerHeight, viewport.height);
      if (height > 0)
        element.style.setProperty("--app-viewport-height", `${height}px`);
    };
    update();
    viewport.addEventListener("resize", update);
    window.addEventListener("resize", update);
    return () => {
      viewport.removeEventListener("resize", update);
      window.removeEventListener("resize", update);
      element.style.removeProperty("--app-viewport-height");
    };
  }, []);
  return root;
}
