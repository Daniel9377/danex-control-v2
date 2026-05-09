"use client";

import { memo } from "react";
import { formatMoney } from "@/lib/currency";
import { cn } from "@/lib/utils";

type Props = {
  amount: number | string | null;
  currency: string;
  className?: string;
  showSign?: boolean;
};

export const MoneyAmount = memo(function MoneyAmount({ amount, currency, className, showSign }: Props) {
  const formatted = formatMoney(amount, currency);
  const n = Number(amount ?? 0);
  return (
    <span className={cn("whitespace-nowrap font-mono tabular-nums", className)}>
      {showSign && Number.isFinite(n) && n > 0 ? "+ " : ""}
      {formatted}
    </span>
  );
});
