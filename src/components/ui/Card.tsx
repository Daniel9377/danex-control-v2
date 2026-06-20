import { memo } from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "glass" | "elevated";

type Props = {
  children: React.ReactNode;
  className?: string;
  variant?: Variant;
  interactive?: boolean;
  onClick?: () => void;
  padding?: string;
};

const variantCls: Record<Variant, string> = {
  default:  "border border-slate-800 bg-[var(--surface-card)]",
  glass:    "border border-slate-700/50 glass-surface",
  elevated: "border border-slate-700/60 bg-[var(--surface-raised)] shadow-lg shadow-black/30",
};

export const Card = memo(function Card({
  children,
  className,
  variant = "default",
  interactive = false,
  onClick,
  padding,
}: Props) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={cn(
        "rounded-xl text-left",
        variantCls[variant],
        (interactive || onClick) && "card-interactive",
        className
      )}
      style={padding ? { padding: `var(--${padding})` } : { padding: "var(--space-4)" }}
    >
      {children}
    </Tag>
  );
});
