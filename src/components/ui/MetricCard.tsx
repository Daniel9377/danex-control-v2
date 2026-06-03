"use client";

import { formatMoney } from "@/lib/currency";
import { cn } from "@/lib/utils";

const COLOR_MAP = {
  default: "text-slate-50",
  green:   "text-emerald-400",
  red:     "text-red-400",
  amber:   "text-amber-400",
  blue:    "text-sky-400",
  orange:  "text-orange-400",
};

export interface MetricCardProps {
  label: string;
  value: number;
  currency?: string;
  color?: keyof typeof COLOR_MAP;
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
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={cn(
        "flex flex-col items-start rounded-xl border border-slate-800 bg-slate-900 p-4 text-left",
        onClick && "card-interactive"
      )}
    >
      <div className="mb-2 flex w-full items-center gap-2">
        {icon && (
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-800 text-slate-400">
            {icon}
          </span>
        )}
        <p className="flex-1 text-xs font-medium text-slate-400">{label}</p>
        {onClick && (
          <span className="text-[10px] text-slate-600 transition-colors group-hover:text-slate-400">↗</span>
        )}
      </div>
      <p className={cn("whitespace-nowrap font-mono text-xl font-bold tabular-nums", COLOR_MAP[color])}>
        {formatMoney(value, currency)}
      </p>
      {note && (
        <p className="mt-1 text-[10px] font-medium text-slate-500">{note}</p>
      )}
      {description && (
        <p className="mt-1.5 text-[10px] leading-relaxed text-slate-600">{description}</p>
      )}
    </Tag>
  );
}
