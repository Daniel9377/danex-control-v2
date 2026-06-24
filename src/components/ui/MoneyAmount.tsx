"use client";

import { memo } from "react";
import { formatMoney } from "@/lib/currency";
import { cn } from "@/lib/utils";

type Tone = "default" | "positive" | "negative" | "client" | "warning" | "muted";
type Size = "sm" | "base" | "md" | "lg" | "xl";

const toneMap: Record<Tone, string> = {
  default:  "text-[var(--money-neutral)]",
  positive: "text-[var(--money-positive)]",
  negative: "text-[var(--money-negative)]",
  client:   "text-[var(--money-client)]",
  warning:  "text-[var(--status-warning)]",
  muted:    "text-[var(--text-muted)]",
};

const sizeMap: Record<Size, string> = {
  sm:   "text-xs",
  base: "text-sm",
  md:   "text-base",
  lg:   "text-xl",
  xl:   "text-3xl",
};

type Props = {
  amount: number | string | null;
  currency: string;
  className?: string;
  showSign?: boolean;
  tone?: Tone;
  size?: Size;
  weight?: "medium" | "semibold" | "bold";
};

export const MoneyAmount = memo(function MoneyAmount({
  amount,
  currency,
  className,
  showSign,
  tone = "default",
  size = "base",
  weight = "bold",
}: Props) {
  const formatted = formatMoney(amount, currency);
  const n = Number(amount ?? 0);

  return (
    <span
      className={cn(
        "whitespace-nowrap font-mono tabular-nums",
        toneMap[tone],
        sizeMap[size],
        weight === "bold" && "font-bold",
        weight === "semibold" && "font-semibold",
        weight === "medium" && "font-medium",
        className
      )}
    >
      {showSign && Number.isFinite(n) && n > 0 ? "+ " : ""}
      {formatted}
    </span>
  );
});
