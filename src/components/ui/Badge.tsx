import { memo } from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "success" | "warning" | "danger" | "info" | "orange";

const variantCls: Record<Variant, string> = {
  default: "bg-[var(--tint-default-bg)] text-[var(--tint-default-fg)] ring-1 ring-slate-700/50",
  success: "bg-[var(--tint-success-bg)] text-[var(--tint-success-fg)] ring-1 ring-emerald-800/40",
  warning: "bg-[var(--tint-warning-bg)] text-[var(--tint-warning-fg)] ring-1 ring-amber-800/40",
  danger:  "bg-[var(--tint-danger-bg)]  text-[var(--tint-danger-fg)]  ring-1 ring-red-800/40",
  info:    "bg-[var(--tint-info-bg)]    text-[var(--tint-info-fg)]    ring-1 ring-blue-800/40",
  orange:  "bg-[var(--tint-orange-bg)]  text-[var(--tint-orange-fg)]  ring-1 ring-orange-800/40",
};

type Props = {
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
  dot?: boolean;
};

export const Badge = memo(function Badge({ children, variant = "default", className, dot }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-[5px] rounded-full px-2 py-0.5 text-xs font-medium",
        variantCls[variant],
        className
      )}
    >
      {dot && (
        <span className="inline-block h-[6px] w-[6px] rounded-full bg-current" />
      )}
      {children}
    </span>
  );
});
