"use client";

import { useMemo } from "react";

/**
 * Decorative demo QR renderer (FNV/xorshift hash → deterministic pattern).
 * Production replaces this with a real scannable OTP/QR payload.
 */

function Finder({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`}>
      <path d="M0 0h7v7H0z M1 1h5v5H1z" fill="#111" fillRule="evenodd" />
      <rect x="2" y="2" width="3" height="3" fill="#111" />
    </g>
  );
}

export function QrCode({ seed, size = 128 }: { seed: string; size?: number }) {
  const rects = useMemo(() => {
    let h = 2166136261;
    for (const ch of seed) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 16777619);
    }
    const rnd = () => {
      h ^= h << 13;
      h ^= h >>> 17;
      h ^= h << 5;
      return (h >>> 0) / 4294967295;
    };
    const out: Array<[number, number]> = [];
    for (let y = 0; y < 21; y++) {
      for (let x = 0; x < 21; x++) {
        const finderZone =
          (x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12);
        if (!finderZone && rnd() > 0.52) out.push([x, y]);
      }
    }
    return out;
  }, [seed]);

  return (
    <svg
      viewBox="-1 -1 23 23"
      width={size}
      height={size}
      role="img"
      aria-label="Demo QR code"
      style={{
        background: "#fff",
        borderRadius: 12,
        border: "1px solid rgba(0,0,0,.08)",
      }}
    >
      {rects.map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="1" height="1" fill="#111" />
      ))}
      <Finder x={0} y={0} />
      <Finder x={14} y={0} />
      <Finder x={0} y={14} />
    </svg>
  );
}
