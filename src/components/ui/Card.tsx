import { memo } from "react";
import { cn } from "@/lib/utils";

type Variant = "default" | "glass" | "elevated";

type Props = {
  children: React.ReactNode;
  className?: string;
  variant?: Variant;
  interactive?: boolean;
  onClick?: () => void;
};

const variantStyles: Record<Variant, string> = {
  default:  "border border-slate-800 bg-slate-900",
  glass:    "border border-slate-700/50 glass-surface",
  elevated: "border border-slate-700/60 bg-slate-800/80 shadow-lg shadow-black/30",
};

export const Card = memo(function Card({
  children,
  className,
  variant = "default",
  interactive = false,
  onClick,
}: Props) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={cn(
        "rounded-xl p-4 text-left",
        variantStyles[variant],
        (interactive || onClick) && "card-interactive",
        className
      )}
    >
      {children}
    </Tag>
  );
});
