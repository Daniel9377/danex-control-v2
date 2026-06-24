"use client";

import { useParams } from "next/navigation";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { SkeletonList } from "@/components/ui/Skeleton";

export default function TransfersLoading() {
  const params = useParams();
  const locale = (params?.locale as string) ?? "fr";
  return (
    <PageWrapper locale={locale}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="h-7 w-28 animate-pulse rounded-lg bg-[var(--surface-chip)]" />
          <div className="h-9 w-44 animate-pulse rounded-lg bg-[var(--surface-chip)]" />
        </div>
        <SkeletonList count={5} />
      </div>
    </PageWrapper>
  );
}
