"use client";

import { useParams } from "next/navigation";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { SkeletonCard } from "@/components/ui/Skeleton";

export default function SettingsLoading() {
  const params = useParams();
  const locale = (params?.locale as string) ?? "fr";
  return (
    <PageWrapper locale={locale}>
      <div className="space-y-6">
        <div className="h-7 w-28 animate-pulse rounded-lg bg-slate-800" />
        <SkeletonCard rows={3} />
        <SkeletonCard rows={4} />
        <SkeletonCard rows={2} />
      </div>
    </PageWrapper>
  );
}
