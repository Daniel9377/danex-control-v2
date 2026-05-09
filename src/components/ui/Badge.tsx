import { memo } from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "success" | "warning" | "danger" | "info" | "orange";

const variantStyles: Record<Variant, string> = {
  default: "bg-slate-700 text-slate-300",
  success: "bg-emerald-900/50 text-emerald-400",
  warning: "bg-amber-900/50 text-amber-400",
  danger: "bg-red-900/50 text-red-400",
  info: "bg-blue-900/50 text-blue-400",
  orange: "bg-orange-900/50 text-orange-400",
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
