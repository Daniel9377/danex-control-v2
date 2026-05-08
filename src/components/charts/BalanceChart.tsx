"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatMoney } from "@/lib/currency";

type DataPoint = {
  date: string;
  balance: number;
};

type Props = {
  data: DataPoint[];
  currency?: string;
};

export function BalanceChart({ data, currency = "USD" }: Props) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis
          dataKey="date"
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
          formatter={(value) => [formatMoney(Number(value ?? 0), currency), "Solde"]}
        />
        <Line
          type="monotone"
          dataKey="balance"
          stroke="#C2550A"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: "#C2550A" }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
