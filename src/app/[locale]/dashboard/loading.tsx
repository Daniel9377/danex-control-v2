"use client";

import { useParams } from "next/navigation";
import { PageWrapper } from "@/components/layout/PageWrapper";

export default function DashboardLoading() {
  const params = useParams();
  const locale = (params?.locale as string) ?? "fr";
  return (
    <PageWrapper locale={locale}>
      <div className="space-y-6">
        <div className="h-7 w-40 animate-pulse rounded-lg bg-slate-800" />
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="mb-2 h-4 w-24 animate-pulse rounded bg-slate-800" />
          <div className="h-9 w-40 animate-pulse rounded bg-slate-800" />
        </div>
        <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900 p-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex justify-between">
              <div className="h-4 w-20 animate-pulse rounded bg-slate-800" />
              <div className="h-4 w-24 animate-pulse rounded bg-slate-800" />
            </div>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="mb-3 h-4 w-32 animate-pulse rounded bg-slate-800" />
            <div className="h-48 animate-pulse rounded bg-slate-800" />
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="mb-3 h-4 w-36 animate-pulse rounded bg-slate-800" />
            <div className="h-48 animate-pulse rounded bg-slate-800" />
          </div>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="mb-3 h-4 w-40 animate-pulse rounded bg-slate-800" />
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="flex justify-between py-1">
                <div className="h-4 w-32 animate-pulse rounded bg-slate-800" />
                <div className="h-4 w-20 animate-pulse rounded bg-slate-800" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}
