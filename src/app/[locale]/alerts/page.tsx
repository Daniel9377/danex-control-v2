"use client";

import { use } from "react";
import { useTranslations } from "next-intl";
import { useAlerts } from "@/hooks/useAlerts";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingPage } from "@/components/ui/LoadingSpinner";
import { AlertType } from "@/lib/supabase/types";
import { formatDate } from "@/lib/utils";
import { CheckCheck, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ locale: string }> };

const typeVariant: Record<AlertType, "danger" | "warning" | "info" | "default"> = {
  negative_balance: "danger",
  debt_due: "warning",
  budget: "info",
  custom: "default",
};

export default function AlertsPage({ params }: Props) {
  const { locale } = use(params);
  const t = useTranslations("alerts");
  const { alerts, loading, markRead, markAllRead } = useAlerts();

  if (loading) return <PageWrapper locale={locale}><LoadingPage /></PageWrapper>;

  const unread = alerts.filter((a) => !a.is_read);

  return (
    <PageWrapper locale={locale}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-50">{t("title")}</h1>
            {unread.length > 0 && (
              <Badge variant="danger">{unread.length}</Badge>
            )}
          </div>
          {unread.length > 0 && (
            <button
              onClick={markAllRead}
              className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-400 hover:bg-slate-800"
            >
              <CheckCheck size={14} />
              {t("mark_all_read")}
            </button>
          )}
        </div>

        {alerts.length === 0 ? (
          <EmptyState message={t("empty")} />
        ) : (
          <div className="space-y-2">
            {alerts.map((alert) => (
              <Card
                key={alert.id}
                className={cn(
                  "transition",
                  !alert.is_read && "border-orange-800/30 bg-orange-950/10"
                )}
              >
                <article className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={typeVariant[alert.type]}>
                        {t(`types.${alert.type}`)}
                      </Badge>
                      {!alert.is_read && (
                        <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />
                      )}
                    </div>
                    <p className="mt-1 text-sm font-medium text-slate-200">{alert.title}</p>
                    {alert.message && (
                      <p className="mt-0.5 text-xs text-slate-500">{alert.message}</p>
                    )}
                    <p className="mt-1 text-xs text-slate-600">
                      {formatDate(alert.triggered_at)}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {!alert.is_read && (
                      <button
                        onClick={() => markRead(alert.id)}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-300"
                        title={t("mark_read")}
                      >
                        <Check size={14} />
                      </button>
                    )}
                  </div>
                </article>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
