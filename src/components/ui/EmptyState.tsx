import { memo } from "react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  message: string;
  className?: string;
};

export const EmptyState = memo(function EmptyState({ message, className }: Props) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 text-slate-600", className)}>
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-800 bg-slate-900">
        <Inbox size={22} className="text-slate-500" />
      </div>
      <p className="text-sm text-slate-500">{message}</p>
    </div>
  );
});
