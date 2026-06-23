import { memo } from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  message: string;
  className?: string;
};

export const EmptyState = memo(function EmptyState({ message, className }: Props) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 text-[var(--text-faint)]", className)}>
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card)]">
        <Inbox size={22} className="text-[var(--text-label)]" />
      </div>
      <p className="text-sm text-[var(--text-label)]">{message}</p>
    </div>
  );
});
