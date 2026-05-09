import { memo } from "react";
import { cn } from "@/lib/utils";

type Props = {
  children: React.ReactNode;
  className?: string;
};

export const Card = memo(function Card({ children, className }: Props) {
  return (
    <div className={cn("rounded-xl border border-slate-800 bg-slate-900 p-4", className)}>
      {children}
    </div>
  );
});
