"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useAccounts } from "@/hooks/useAccounts";
import { useTransactions } from "@/hooks/useTransactions";
import { useDebts } from "@/hooks/useDebts";
import { useAlerts } from "@/hooks/useAlerts";
import { useCurrencies } from "@/hooks/useCurrencies";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Card } from "@/components/ui/Card";
import { MoneyAmount } from "@/components/ui/MoneyAmount";
import { Badge } from "@/components/ui/Badge";
import { ExpenseChart } from "@/components/charts/ExpenseChart";
import { CategoryPie } from "@/components/charts/CategoryPie";
import { BalanceDetailSheet, type DetailItem } from "@/components/ui/BalanceDetailSheet";
import { sumAccountsInCurrency, getValidRate, DEFAULT_CURRENCIES, formatMoney } from "@/lib/currency";
import { formatDate, isOverdue } from "@/lib/utils";
import { use, useMemo, useState } from "react";
import { AccountAvailability } from "@/lib/supabase/types";

type Props = {
  params: Promise<{ locale: string }>;
};

type ChartPeriod = "week" | "month" | "3months" | "6months" | "year";

type DetailSheet = {
  title: string;
  items: DetailItem[];
  total: number;
};

const AVAIL_LABELS: Record<AccountAvailability, string> = {
  immediate: "Disponible maintenant",
  close: "Accessible facilement",
  distant: "Éloigné",
  blocked: "Bloqué",
};

export default function DashboardPage({ params }: Props) {
  const { locale } = use(params);
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");
  const td = useTranslations("debts");

  const { accounts, loading: accountsLoading } = useAccounts();
  const { transactions, loading: txLoading } = useTransactions();
  const { debts, loading: debtsLoading } = useDebts();
  const { alerts } = useAlerts();
  const { ratesByCode, loading: currLoading } = useCurrencies();

  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("month");
  const [detailSheet, setDetailSheet] = useState<DetailSheet | null>(null);

  // All useMemo must be above the loading guard (Rules of Hooks)
  const { total: totalUSD, hasMissing } = useMemo(
    () => sumAccountsInCurrency(accounts, "USD", ratesByCode),
    [accounts, ratesByCode]
  );

  const availableBalance = useMemo(() => {
    const avAccounts = accounts.filter(
      (a) => !a.availability || a.availability === "immediate"
    );
    return sumAccountsInCurrency(avAccounts, "USD", ratesByCode);
  }, [accounts, ratesByCode]);

  const distantBalance = useMemo(() => {
    const distAccounts = accounts.filter(
      (a) => a.availability === "distant" || a.availability === "blocked"
    );
    return sumAccountsInCurrency(distAccounts, "USD", ratesByCode);
  }, [accounts, ratesByCode]);

  const netDebtBalance = useMemo(() => {
    const owesMe = debts
      .filter((d) => d.direction === "owes_me" && d.status !== "paid")
      .reduce((sum, d) => {
        const remaining = Number(d.amount) - Number(d.paid_amount);
        return sum + remaining * resolveRate(d.currency, ratesByCode);
      }, 0);
    const iOwe = debts
      .filter((d) => d.direction === "i_owe" && d.status !== "paid")
      .reduce((sum, d) => {
        const remaining = Number(d.amount) - Number(d.paid_amount);
        return sum + remaining * resolveRate(d.currency, ratesByCode);
      }, 0);
    return { owesMe, iOwe, net: owesMe - iOwe };
  }, [debts, ratesByCode]);

  const recent = useMemo(() => transactions.slice(0, 5), [transactions]);
  const activeDebts = useMemo(() => debts.filter((d) => d.status !== "paid").slice(0, 5), [debts]);
  const unreadAlerts = useMemo(() => alerts.filter((a) => !a.is_read), [alerts]);
  const monthData = useMemo(
    () => buildPeriodChartData(transactions, ratesByCode, chartPeriod),
    [transactions, ratesByCode, chartPeriod]
  );
  const categoryData = useMemo(
    () => buildCategoryData(transactions, ratesByCode),
    [transactions, ratesByCode]
  );

  function openDetail(type: "available" | "global" | "distant" | "debts") {
    if (type === "debts") {
      const items: DetailItem[] = debts
        .filter((d) => d.status !== "paid")
        .map((d) => ({
          name: d.person_name,
          subtitle: d.direction === "owes_me" ? "Me doit" : "Je dois",
          originalAmount: Number(d.amount) - Number(d.paid_amount),
          currency: d.currency,
          convertedAmount: (Number(d.amount) - Number(d.paid_amount)) * resolveRate(d.currency, ratesByCode),
          isPositive: d.direction === "owes_me",
        }));
      setDetailSheet({ title: "Dettes & Créances actives", items, total: netDebtBalance.net });
      return;
    }

    const subset =
      type === "available"
        ? accounts.filter((a) => !a.availability || a.availability === "immediate")
        : type === "distant"
        ? accounts.filter((a) => a.availability === "distant" || a.availability === "blocked")
        : accounts;

    const items: DetailItem[] = subset.map((a) => ({
      name: a.name,
      subtitle: AVAIL_LABELS[a.availability ?? "immediate"],
      originalAmount: Number(a.balance),
      currency: a.currency,
      convertedAmount: Number(a.balance) * resolveRate(a.currency, ratesByCode),
      isPositive: Number(a.balance) >= 0,
    }));

    const total =
      type === "available"
        ? availableBalance.total
        : type === "distant"
        ? distantBalance.total
        : totalUSD;

    const title =
      type === "available"
        ? t("available_now")
        : type === "distant"
        ? t("distant_blocked")
        : t("global_balance");

    setDetailSheet({ title, items, total });
  }

  if (accountsLoading || txLoading || debtsLoading || currLoading) return (
    <PageWrapper locale={locale}>
      <div className="space-y-6">
        <div className="h-7 w-40 animate-pulse rounded-lg bg-slate-800" />
        <div className="grid grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
              <div className="h-3 w-20 animate-pulse rounded bg-slate-800 mb-2" />
              <div className="h-7 w-28 animate-pulse rounded bg-slate-800" />
            </div>
          ))}
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="h-4 w-32 animate-pulse rounded bg-slate-800 mb-3" />
            <div className="h-48 animate-pulse rounded bg-slate-800" />
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
            <div className="h-4 w-36 animate-pulse rounded bg-slate-800 mb-3" />
            <div className="h-48 animate-pulse rounded bg-slate-800" />
          </div>
        </div>
      </div>
    </PageWrapper>
  );

  return (
    <PageWrapper locale={locale}>
      <div className="space-y-6">
        <h1 className="text-xl font-bold text-slate-50">{t("title")}</h1>

        {/* 4 summary cards */}
        <div className="grid grid-cols-2 gap-3">
          {/* Disponible */}
          <button
            onClick={() => openDetail("available")}
            className="flex flex-col items-start rounded-xl border border-slate-800 bg-slate-900 p-4 text-left transition hover:border-slate-700 hover:bg-slate-800/60 active:scale-[0.98]"
          >
            <p className="mb-1 text-xs text-slate-400">{t("available_now")}</p>
            <p className={`font-mono tabular-nums text-lg font-bold whitespace-nowrap ${availableBalance.total < 0 ? "text-red-400" : "text-emerald-400"}`}>
              {formatMoney(availableBalance.total, "USD")}
            </p>
            {availableBalance.hasMissing && (
              <p className="mt-0.5 text-xs text-amber-500">*</p>
            )}
          </button>

          {/* Solde global */}
          <button
            onClick={() => openDetail("global")}
            className="flex flex-col items-start rounded-xl border border-slate-800 bg-slate-900 p-4 text-left transition hover:border-slate-700 hover:bg-slate-800/60 active:scale-[0.98]"
          >
            <p className="mb-1 text-xs text-slate-400">{t("global_balance")}</p>
            <p className={`font-mono tabular-nums text-lg font-bold whitespace-nowrap ${totalUSD < 0 ? "text-red-400" : "text-slate-50"}`}>
              {formatMoney(totalUSD, "USD")}
            </p>
            {hasMissing && (
              <p className="mt-0.5 text-xs text-amber-500">*</p>
            )}
          </button>

          {/* Éloigné / Bloqué */}
          <button
            onClick={() => openDetail("distant")}
            className="flex flex-col items-start rounded-xl border border-slate-800 bg-slate-900 p-4 text-left transition hover:border-slate-700 hover:bg-slate-800/60 active:scale-[0.98]"
          >
            <p className="mb-1 text-xs text-slate-400">{t("distant_blocked")}</p>
            <p className="font-mono tabular-nums text-lg font-bold whitespace-nowrap text-amber-400">
              {formatMoney(distantBalance.total, "USD")}
            </p>
          </button>

          {/* Dettes nettes */}
          <button
            onClick={() => openDetail("debts")}
            className="flex flex-col items-start rounded-xl border border-slate-800 bg-slate-900 p-4 text-left transition hover:border-slate-700 hover:bg-slate-800/60 active:scale-[0.98]"
          >
            <p className="mb-1 text-xs text-slate-400">{t("net_debts")}</p>
            <p className={`font-mono tabular-nums text-lg font-bold whitespace-nowrap ${netDebtBalance.net >= 0 ? "text-emerald-400" : "text-red-400"}`}>
              {netDebtBalance.net >= 0 ? "+" : ""}
              {formatMoney(Math.abs(netDebtBalance.net), "USD")}
            </p>
          </button>
        </div>

        {/* Charts row */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-sm font-medium text-slate-400">
                {t("income_vs_expenses")}
              </p>
              <select
                value={chartPeriod}
                onChange={(e) => setChartPeriod(e.target.value as ChartPeriod)}
                className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300 focus:border-orange-500 focus:outline-none"
              >
                <option value="week">Cette semaine</option>
                <option value="month">Ce mois</option>
                <option value="3months">3 derniers mois</option>
                <option value="6months">6 derniers mois</option>
                <option value="year">Cette année</option>
              </select>
            </div>
            <ExpenseChart data={monthData} currency="USD" />
          </Card>
          <Card>
            <p className="mb-3 text-sm font-medium text-slate-400">
              {t("expenses_by_category")}
            </p>
            {categoryData.length > 0 ? (
              <CategoryPie data={categoryData} currency="USD" />
            ) : (
              <p className="py-12 text-center text-sm text-slate-500">
                {tc("empty")}
              </p>
            )}
          </Card>
        </div>

        {/* Recent transactions — limited to 10 */}
        <Card>
          <p className="mb-3 text-sm font-medium text-slate-400">
            {t("recent_transactions")}
          </p>
          {recent.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">{tc("empty")}</p>
          ) : (
            <>
              <ul className="divide-y divide-slate-800">
                {recent.map((tx) => {
                  const acc = accounts.find((a) => a.id === tx.account_id);
                  return (
                    <li key={tx.id} className="flex items-start justify-between gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${tx.type === "expense" ? "bg-red-950/60 text-red-400" : "bg-emerald-950/60 text-emerald-400"}`}>
                            {tx.type === "expense" ? "−" : "+"}
                          </span>
                          <p className="truncate text-sm text-slate-200">
                            {tx.category ?? tx.note ?? "—"}
                          </p>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {acc?.name ?? "—"} · {formatDate(tx.transaction_date)}
                        </p>
                      </div>
                      <div className="shrink-0">
                        <MoneyAmount
                          amount={tx.type === "expense" ? -tx.amount : tx.amount}
                          currency={tx.currency}
                          className={`font-mono tabular-nums text-sm ${tx.type === "expense" ? "text-red-400" : "text-emerald-400"}`}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
              {transactions.length > 5 && (
                <Link
                  href={`/${locale}/transactions`}
                  className="mt-3 flex w-full items-center justify-center rounded-lg border border-slate-700 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                >
                  {tc("see_all")} ({transactions.length})
                </Link>
              )}
            </>
          )}
        </Card>

        {/* Active debts */}
        {activeDebts.length > 0 && (
          <Card>
            <p className="mb-3 text-sm font-medium text-slate-400">
              {t("active_debts")}
            </p>
            <ul className="divide-y divide-slate-800">
              {activeDebts.map((debt) => (
                <li key={debt.id} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-200">
                      {debt.person_name}
                    </p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <Badge variant={debt.direction === "i_owe" ? "danger" : "success"}>
                        {debt.direction === "i_owe" ? td("i_owe") : td("owes_me")}
                      </Badge>
                      {debt.due_date && isOverdue(debt.due_date) && (
                        <Badge variant="warning">{td("overdue")}</Badge>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">
                    <MoneyAmount
                      amount={Number(debt.amount) - Number(debt.paid_amount)}
                      currency={debt.currency}
                      className="font-mono tabular-nums text-sm text-slate-100"
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Unread alerts */}
        {unreadAlerts.length > 0 && (
          <Card className="border-amber-800/40 bg-amber-950/20">
            <div className="flex items-center gap-2">
              <span className="text-amber-400">⚠</span>
              <p className="text-sm font-medium text-amber-400">
                {unreadAlerts.length} alerte{unreadAlerts.length > 1 ? "s" : ""}
              </p>
            </div>
            <ul className="mt-3 space-y-2">
              {unreadAlerts.slice(0, 3).map((alert) => (
                <li key={alert.id} className="text-sm text-amber-300/80">
                  {alert.title}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {/* Balance detail sheet */}
      <BalanceDetailSheet
        open={!!detailSheet}
        title={detailSheet?.title ?? ""}
        items={detailSheet?.items ?? []}
        total={detailSheet?.total ?? 0}
        displayCurrency="USD"
        onClose={() => setDetailSheet(null)}
      />
    </PageWrapper>
  );
}

const DEFAULT_RATE_MAP: Record<string, number> = Object.fromEntries(
  DEFAULT_CURRENCIES.map((c) => [c.code, c.rate_to_usd])
);

function resolveRate(currency: string, ratesByCode: Record<string, number | string | null>): number {
  return getValidRate(ratesByCode[currency]) ?? DEFAULT_RATE_MAP[currency] ?? 1;
}

function buildPeriodChartData(
  transactions: { type: string; amount: number; currency: string; transaction_date: string }[],
  ratesByCode: Record<string, number | string | null>,
  period: ChartPeriod
) {
  const now = new Date();
  const displayRate = resolveRate("USD", ratesByCode);
  const buckets: Record<string, { income: number; expenses: number }> = {};

  if (period === "week") {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      const key = d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
      buckets[key] = { income: 0, expenses: 0 };
    }
    transactions.forEach((tx) => {
      const d = new Date(tx.transaction_date);
      const msAgo = now.getTime() - d.getTime();
      if (msAgo > 7 * 24 * 60 * 60 * 1000) return;
      const key = d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
      if (!buckets[key]) return;
      const usd = (Number(tx.amount) * resolveRate(tx.currency, ratesByCode)) / displayRate;
      if (tx.type === "income") buckets[key].income += usd;
      else buckets[key].expenses += usd;
    });
  } else {
    const monthCount = period === "month" ? 6 : period === "3months" ? 3 : period === "6months" ? 6 : 12;
    for (let i = monthCount - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
      buckets[key] = { income: 0, expenses: 0 };
    }
    transactions.forEach((tx) => {
      const d = new Date(tx.transaction_date);
      const key = d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
      if (!buckets[key]) return;
      const usd = (Number(tx.amount) * resolveRate(tx.currency, ratesByCode)) / displayRate;
      if (tx.type === "income") buckets[key].income += usd;
      else buckets[key].expenses += usd;
    });
  }

  return Object.entries(buckets).map(([month, v]) => ({ month, ...v }));
}

function buildCategoryData(
  transactions: { type: string; amount: number; currency: string; category: string | null; transaction_date: string }[],
  ratesByCode: Record<string, number | string | null>
) {
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();
  const cats: Record<string, number> = {};
  const displayRate = resolveRate("USD", ratesByCode);
  transactions
    .filter((tx) => {
      const d = new Date(tx.transaction_date);
      return tx.type === "expense" && d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    })
    .forEach((tx) => {
      const cat = tx.category ?? "Divers";
      cats[cat] = (cats[cat] ?? 0) + (Number(tx.amount) * resolveRate(tx.currency, ratesByCode)) / displayRate;
    });
  return Object.entries(cats).map(([name, value]) => ({ name, value }));
}
