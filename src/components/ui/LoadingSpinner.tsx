import { cn } from "@/lib/utils";

type Props = {
  className?: string;
  size?: "sm" | "md" | "lg";
};

const sizes = {
  sm: "h-4 w-4 border-2",
  md: "h-8 w-8 border-2",
  lg: "h-12 w-12 border-3",
};

export function LoadingSpinner({ className, size = "md" }: Props) {
  return (
    <div
      className={cn(
        "animate-spin rounded-full border-[var(--border-strong)] border-t-orange-500",
        sizes[size],
        className
      )}
    />
  );
}

export function LoadingPage() {
  return (
    <div className="flex h-full min-h-64 items-center justify-center">
      <LoadingSpinner size="lg" />
    </div>
  );
}
