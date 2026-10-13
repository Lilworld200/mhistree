"use client";

import * as AvatarPrimitive from "@radix-ui/react-avatar";
import { cn } from "@/lib/utils/cn";

type AvatarProps = {
  img?: string;
  ring?: string;
  size?: number;
  name?: string;
};

export function Avatar({
  img,
  ring = "#C7C6F2",
  size = 44,
  name = "?",
}: AvatarProps) {
  const initial = (name[0] ?? "?").toUpperCase();
  return (
    <AvatarPrimitive.Root
      className="av"
      style={{
        width: size,
        height: size,
        minWidth: size,
        borderRadius: "50%",
        overflow: "hidden",
        boxShadow: `0 5px 12px rgba(0,0,0,.12), 0 0 0 3px ${ring} inset`,
      }}
    >
      {img ? (
        <AvatarPrimitive.Image
          src={img}
          alt={name}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            borderRadius: "50%",
          }}
        />
      ) : null}
      <AvatarPrimitive.Fallback
        className="av-init"
        style={{
          background: ring,
          width: "100%",
          height: "100%",
          borderRadius: "50%",
          display: "grid",
          placeItems: "center",
          fontWeight: 800,
          fontSize: Math.round(size * 0.38),
          color: "#181818",
        }}
        delayMs={img ? 300 : 0}
      >
        {initial}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

export function AvatarRail({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("rail", className)}>{children}</div>;
}
