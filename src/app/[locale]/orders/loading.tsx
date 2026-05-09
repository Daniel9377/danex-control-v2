"use client";

import { useParams } from "next/navigation";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { SkeletonList } from "@/components/ui/Skeleton";

export default function OrdersLoading() {
  const params = useParams();
  const locale = (params?.locale as string) ?? "fr";
  return (
    <PageWrapper locale={locale}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="h-7 w-28 animate-pulse rounded-lg bg-slate-800" />
          <div className="h-9 w-40 animate-pulse rounded-lg bg-slate-800" />
        </div>
        <SkeletonList count={5} />
      </div>
    </PageWrapper>
  );
}
