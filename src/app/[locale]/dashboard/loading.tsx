"use client";

import { useParams } from "next/navigation";
import { PageWrapper } from "@/components/layout/PageWrapper";

export default function DashboardLoading() {
  const params = useParams();
  const locale = (params?.locale as string) ?? "fr";
  return (
    <PageWrapper locale={locale}>
      <div className="space-y-4">
        {/* Balance skeleton */}
        <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-card)] p-5">
          <div className="mb-2 h-3 w-32 animate-pulse rounded bg-[var(--surface-chip)]" />
          <div className="h-9 w-48 animate-pulse rounded bg-[var(--surface-chip)]" />
        </div>
        {/* 3 tiles */}
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] p-4">
              <div className="mb-2 h-3 w-16 animate-pulse rounded bg-[var(--surface-chip)]" />
              <div className="h-6 w-24 animate-pulse rounded bg-[var(--surface-chip)]" />
            </div>
          ))}
        </div>
        {/* 2 obligation rows */}
        <div className="grid grid-cols-2 gap-2">
          {[0, 1].map((i) => (
            <div key={i} className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-card)]/70 px-3 py-2.5">
              <div className="h-4 w-28 animate-pulse rounded bg-[var(--surface-chip)]" />
            </div>
          ))}
        </div>
        {/* Quick actions */}
        <div className="flex gap-2">
          {[0, 1].map((i) => (
            <div key={i} className="flex-1 rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] py-3">
              <div className="mx-auto h-4 w-24 animate-pulse rounded bg-[var(--surface-chip)]" />
            </div>
          ))}
        </div>
        {/* Month tiles */}
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] p-3">
              <div className="mb-2 h-3 w-12 animate-pulse rounded bg-[var(--surface-chip)]" />
              <div className="h-5 w-20 animate-pulse rounded bg-[var(--surface-chip)]" />
            </div>
          ))}
        </div>
        {/* Recent tx skeleton */}
        <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-card)] p-4">
          <div className="mb-3 h-4 w-32 animate-pulse rounded bg-[var(--surface-chip)]" />
          {[0, 1, 2].map((i) => (
            <div key={i} className="mb-2 flex justify-between py-1">
              <div className="h-4 w-40 animate-pulse rounded bg-[var(--surface-chip)]" />
              <div className="h-4 w-20 animate-pulse rounded bg-[var(--surface-chip)]" />
            </div>
          ))}
        </div>
      </div>
    </PageWrapper>
  );
}
