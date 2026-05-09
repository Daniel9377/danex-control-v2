"use client";

import { useParams } from "next/navigation";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { SkeletonList } from "@/components/ui/Skeleton";

export default function TransactionsLoading() {
  const params = useParams();
  const locale = (params?.locale as string) ?? "fr";
  return (
    <PageWrapper locale={locale}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="h-7 w-32 animate-pulse rounded-lg bg-slate-800" />
          <div className="h-9 w-44 animate-pulse rounded-lg bg-slate-800" />
        </div>
        <div className="flex gap-2">
          {[80, 100, 120].map((w) => (
            <div key={w} style={{ width: w }} className="h-8 animate-pulse rounded-lg bg-slate-800" />
          ))}
        </div>
        <SkeletonList count={6} />
      </div>
    </PageWrapper>
  );
}
