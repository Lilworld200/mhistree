"use client";

import { Area, AreaChart, ResponsiveContainer } from "recharts";

export function AreaSparkline({
  data,
  gradientId,
  height = 74,
  color = "#478BEE",
}: {
  data: number[];
  gradientId: string;
  height?: number;
  color?: string;
}) {
  const points = data.map((v) => ({ v }));
  return (
    <div style={{ height, marginTop: 6 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="v"
            stroke={color}
            strokeWidth={2.4}
            fill={`url(#${gradientId})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
