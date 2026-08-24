"use client";

import { useEffect, useState } from "react";

export function Countdown({
  exp,
  prefix = "Expires in ",
}: {
  exp: number;
  prefix?: string;
}) {
  const [left, setLeft] = useState(() => exp - Date.now());
  const expired = left <= 0;

  useEffect(() => {
    if (expired) return;
    const t = setInterval(() => setLeft(exp - Date.now()), 1000);
    return () => clearInterval(t);
  }, [exp, expired]);

  if (expired) return <span style={{ color: "var(--red)" }}>Expired</span>;
  const s = Math.floor(left / 1000);
  return (
    <>
      {prefix}
      {Math.floor(s / 60)}m {s % 60}s
    </>
  );
}
