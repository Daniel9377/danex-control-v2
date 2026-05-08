import { cn } from "@/lib/utils";

type Props = {
  className?: string;
};

export function Skeleton({ className }: Props) {
  return (
    <div className={cn("animate-pulse rounded-lg bg-slate-800", className)} />
  );
}

export function SkeletonCard({ rows = 2 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className={`h-4 ${i === 0 ? "w-3/4" : "w-1/2"}`} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonList({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} rows={2} />
      ))}
    </div>
  );
}
