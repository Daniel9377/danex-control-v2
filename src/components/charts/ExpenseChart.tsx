"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatMoney } from "@/lib/currency";

type DataPoint = {
  month: string;
  income: number;
  expenses: number;
};

type Props = {
  data: DataPoint[];
  currency?: string;
};

export function ExpenseChart({ data, currency = "USD" }: Props) {
  return (
    <div className="[&_svg]:outline-none [&_svg]:focus:outline-none">
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }} style={{ outline: "none" }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
        <XAxis
          dataKey="month"
          tick={{ fill: "var(--text-label)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fill: "var(--text-label)", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => formatMoney(v, currency)}
          width={80}
        />
        <Tooltip
          cursor={false}
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
            name === "income" ? "Revenus" : "Dépenses",
          ]}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, color: "var(--text-muted)" }}
          formatter={(value) =>
            value === "income" ? "Revenus" : "Dépenses"
          }
        />
        <Bar dataKey="income" fill="#10b981" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        <Bar dataKey="expenses" fill="#ef4444" radius={[3, 3, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
    </div>
  );
}
