import { cn } from "@/lib/utils";

type Props = {
  message: string;
  className?: string;
};

export function EmptyState({ message, className }: Props) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center py-12 text-slate-500",
        className
      )}
    >
      <div className="mb-2 text-3xl">📭</div>
      <p className="text-sm">{message}</p>
    </div>
  );
}
