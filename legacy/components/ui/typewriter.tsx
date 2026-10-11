"use client";

import { useEffect, useState } from "react";
import { MarkdownRenderer } from "./markdown-renderer";

export function Typewriter({ text, on }: { text: string; on: boolean }) {
  const [n, setN] = useState(on ? 0 : text.length);

  useEffect(() => {
    if (!on || n >= text.length) return;
    const t = setTimeout(
      () => setN((prev) => Math.min(text.length, prev + 3)),
      16,
    );
    return () => clearTimeout(t);
  }, [n, on, text]);

  const visibleText = on ? text.slice(0, n) : text;
  const isTyping = on && n < text.length;

  return (
    <div className="typewriter-md">
      <MarkdownRenderer content={visibleText} />
      {isTyping && <span className="caret">▍</span>}
    </div>
  );
}
