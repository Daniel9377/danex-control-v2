import { memo } from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "success" | "warning" | "danger" | "info" | "orange";

const variantStyles: Record<Variant, string> = {
  default: "bg-slate-800/60 text-slate-300 ring-1 ring-slate-700/50",
  success: "bg-emerald-950/60 text-emerald-400 ring-1 ring-emerald-800/40",
  warning: "bg-amber-950/60 text-amber-400 ring-1 ring-amber-800/40",
  danger:  "bg-red-950/60 text-red-400 ring-1 ring-red-800/40",
  info:    "bg-blue-950/60 text-blue-400 ring-1 ring-blue-800/40",
  orange:  "bg-orange-950/60 text-orange-400 ring-1 ring-orange-800/40",
};

type Props = {
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
};

export const Badge = memo(function Badge({ children, variant = "default", className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        variantStyles[variant],
        className
      )}
    >
      {children}
    </span>
  );
});
