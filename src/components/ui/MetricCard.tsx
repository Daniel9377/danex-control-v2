"use client";

import { cn } from "@/lib/utils";
import { MoneyAmount } from "@/components/ui/MoneyAmount";

const COLOR_TONES = {
  default: "default",
  green:   "positive",
  red:     "negative",
  amber:   "warning",
  blue:    "client",
  orange:  "default",
} as const;

export interface MetricCardProps {
  label: string;
  value: number;
  currency?: string;
  color?: keyof typeof COLOR_TONES;
  note?: string;
  description?: string;
  onClick?: () => void;
  icon?: React.ReactNode;
}

export function MetricCard({
  label,
  value,
  currency = "USD",
  color = "default",
  note,
  description,
  onClick,
  icon,
}: MetricCardProps) {
  const tone = COLOR_TONES[color] as "default" | "positive" | "negative" | "warning" | "client";
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={cn(
        "flex flex-col items-start rounded-xl border border-slate-800 bg-[var(--surface-card)] p-4 text-left",
        onClick && "card-interactive"
      )}
    >
      <div className="mb-2 flex w-full items-center gap-2">
        {icon && (
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800 text-[var(--text-muted)]">
            {icon}
          </span>
        )}
        <p className="flex-1 text-xs font-medium text-[var(--text-label)]">{label}</p>
      </div>
      <MoneyAmount amount={value} currency={currency} tone={tone} size="lg" />
      {note && (
        <p className="mt-1 text-[10px] font-medium text-[var(--text-label)]">{note}</p>
      )}
      {description && (
        <p className="mt-1.5 text-[10px] leading-relaxed text-[var(--text-faint)]">{description}</p>
      )}
    </Tag>
  );
}
