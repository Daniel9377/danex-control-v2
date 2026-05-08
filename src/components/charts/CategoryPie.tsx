"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Sector,
} from "recharts";
import { formatMoney } from "@/lib/currency";

const COLORS = [
  "#C2550A",
  "#f97316",
  "#10b981",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f59e0b",
];

type DataPoint = {
  name: string;
  value: number;
};

type Props = {
  data: DataPoint[];
  currency?: string;
};

// Render active sector identically to normal — suppresses the default blue/enlarged hover effect
function renderActiveShape(props: any) {
  return <Sector {...props} strokeWidth={0} />;
}

export function CategoryPie({ data, currency = "USD" }: Props) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={80}
          paddingAngle={2}
          dataKey="value"
          strokeWidth={0}
          activeShape={renderActiveShape}
        >
          {data.map((_, index) => (
            <Cell
              key={`cell-${index}`}
              fill={COLORS[index % COLORS.length]}
              stroke="none"
            />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: "#0f172a",
            border: "1px solid #1e293b",
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: "#94a3b8" }}
          formatter={(value) => [formatMoney(Number(value ?? 0), currency), "Montant"]}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, color: "#94a3b8" }}
          iconType="circle"
          iconSize={8}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
