"use client";

import { useEffect, useState } from "react";

export function Typewriter({ text, on }: { text: string; on: boolean }) {
  const [n, setN] = useState(on ? 0 : text.length);
  useEffect(() => {
    if (!on || n >= text.length) return;
    const t = setTimeout(() => setN(n + 3), 16);
    return () => clearTimeout(t);
  }, [n, on, text]);
  return (
    <>
      {text.slice(0, n)}
      {n < text.length && <span className="caret">▍</span>}
    </>
  );
}
