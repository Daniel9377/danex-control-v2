"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatMoney } from "@/lib/currency";

// 15 visually distinct colors — all vibrant on dark background
const PALETTE = [
  "#f97316", // orange
  "#10b981", // emerald
  "#3b82f6", // blue
  "#ec4899", // pink
  "#8b5cf6", // purple
  "#f59e0b", // amber
  "#14b8a6", // teal
  "#ef4444", // red
  "#06b6d4", // cyan
  "#84cc16", // lime
  "#a78bfa", // light purple
  "#fb923c", // light orange
  "#34d399", // light green
  "#60a5fa", // light blue
  "#f472b6", // light pink
];

// Deterministic color from category name — same name always gets same color
function stableColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  return PALETTE[h % PALETTE.length];
}

type DataPoint = {
  name: string;
  value: number;
};

type Props = {
  data: DataPoint[];
  currency?: string;
};

export function CategoryPie({ data, currency = "USD" }: Props) {
  const total = data.reduce((s, d) => s + d.value, 0);

  // Sort by value descending, drop entries that round to 0%
  const sorted = [...data]
    .sort((a, b) => b.value - a.value)
    .filter((d) => total === 0 || Math.round((d.value / total) * 100) > 0);

  return (
    <div
      tabIndex={-1}
      className="[&_svg]:outline-none [&_svg]:focus:outline-none focus:outline-none"
      style={{ WebkitTapHighlightColor: "transparent" }}
    >
      {/* Donut chart */}
      <ResponsiveContainer width="100%" height={160}>
        <PieChart style={{ outline: "none" }} tabIndex={-1}>
          <Pie
            data={sorted}
            cx="50%"
            cy="50%"
            innerRadius={45}
            outerRadius={72}
            paddingAngle={2}
            dataKey="value"
            strokeWidth={0}
            stroke="none"
            isAnimationActive={false}
            activeShape={false as unknown as undefined}
          >
            {sorted.map((entry) => (
              <Cell
                key={`cell-${entry.name}`}
                fill={stableColor(entry.name)}
                stroke="none"
                tabIndex={-1}
              />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--surface-card)",
              border: "1px solid var(--border-default)",
              borderRadius: 8,
              fontSize: 12,
              color: "var(--text-body)",
            }}
            labelStyle={{ color: "var(--text-muted)" }}
            formatter={(value, name) => [
              formatMoney(Number(value ?? 0), currency),
              String(name),
            ]}
          />
        </PieChart>
      </ResponsiveContainer>

      {/* Custom legend — 2-column grid, shows name + percentage */}
      <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {sorted.map((entry) => {
          const pct = total > 0 ? Math.round((entry.value / total) * 100) : 0;
          return (
            <div key={entry.name} className="flex min-w-0 items-center gap-1.5">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: stableColor(entry.name) }}
              />
              <span className="truncate text-xs text-[var(--text-muted)]">{entry.name}</span>
              <span className="ml-auto shrink-0 text-xs tabular-nums text-[var(--text-label)]">
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
