"use client";

import { cn } from "@/lib/utils";

export type SegmentedTab<T extends string> = {
  value: T;
  label: string;
  count?: number;
};

type Props<T extends string> = {
  tabs: SegmentedTab<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
};

export function SegmentedControl<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: Props<T>) {
  return (
    <div className={cn("flex gap-0.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-app)] p-1", className)}>
      {tabs.map((tab) => {
        const active = tab.value === value;
        return (
          <button
            key={tab.value}
            type="button"
            onClick={() => onChange(tab.value)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-all duration-200",
              active
                ? "bg-[var(--surface-chip)] text-[var(--text-strong)] shadow-sm"
                : "text-[var(--text-label)] hover:text-[var(--text-body)]"
            )}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
                  active
                    ? "bg-[var(--surface-chip)] text-[var(--text-body)]"
                    : "bg-[var(--surface-chip)] text-[var(--text-label)]"
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
