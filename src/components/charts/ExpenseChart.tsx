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
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis
          dataKey="month"
          tick={{ fill: "#64748b", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fill: "#64748b", fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => formatMoney(v, currency)}
          width={80}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#0f172a",
            border: "1px solid #1e293b",
            borderRadius: 8,
            fontSize: 12,
          }}
          labelStyle={{ color: "#94a3b8" }}
          formatter={(value, name) => [
            formatMoney(Number(value ?? 0), currency),
            name === "income" ? "Revenus" : "Dépenses",
          ]}
        />
        <Legend
          wrapperStyle={{ fontSize: 12, color: "#94a3b8" }}
          formatter={(value) =>
            value === "income" ? "Revenus" : "Dépenses"
          }
        />
        <Bar dataKey="income" fill="#10b981" radius={[3, 3, 0, 0]} />
        <Bar dataKey="expenses" fill="#C2550A" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
