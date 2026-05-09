"use client";

import { useTranslations } from "next-intl";
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
import { sumAccountsInCurrency, getValidRate, DEFAULT_CURRENCIES } from "@/lib/currency";
import { formatDate, isOverdue } from "@/lib/utils";
import { use, useMemo } from "react";

type Props = {
  params: Promise<{ locale: string }>;
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

  // All hooks must run unconditionally — moved above the loading guard to
  // satisfy the Rules of Hooks (hook count must not change between renders).
  const { total: totalUSD, hasMissing } = useMemo(
    () => sumAccountsInCurrency(accounts, "USD", ratesByCode),
    [accounts, ratesByCode]
  );

  const byCurrency = useMemo(
    () => accounts.reduce<Record<string, number>>((acc, a) => {
      acc[a.currency] = (acc[a.currency] ?? 0) + Number(a.balance);
      return acc;
    }, {}),
    [accounts]
  );

  const recent = useMemo(() => transactions.slice(0, 5), [transactions]);
  const activeDebts = useMemo(() => debts.filter((d) => d.status !== "paid").slice(0, 5), [debts]);
  const unreadAlerts = useMemo(() => alerts.filter((a) => !a.is_read), [alerts]);
  const monthData = useMemo(() => buildMonthData(transactions, ratesByCode), [transactions, ratesByCode]);
  const categoryData = useMemo(() => buildCategoryData(transactions, ratesByCode), [transactions, ratesByCode]);

  if (accountsLoading || txLoading || debtsLoading || currLoading) return (
    <PageWrapper locale={locale}>
      <div className="space-y-6">
        <div className="h-7 w-40 animate-pulse rounded-lg bg-slate-800" />
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <div className="h-4 w-24 animate-pulse rounded bg-slate-800 mb-2" />
          <div className="h-9 w-40 animate-pulse rounded bg-slate-800" />
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex justify-between">
              <div className="h-4 w-20 animate-pulse rounded bg-slate-800" />
              <div className="h-4 w-24 animate-pulse rounded bg-slate-800" />
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

        {/* Total balance */}
        <Card>
          <p className="text-sm text-slate-400">{t("total_balance")}</p>
          <div className="mt-1 flex items-baseline gap-2">
            <MoneyAmount
              amount={totalUSD}
              currency="USD"
              className="text-3xl font-bold text-slate-50"
            />
          </div>
          {hasMissing && (
            <p className="mt-1 text-xs text-amber-500">{tc("currency_missing")}</p>
          )}
        </Card>

        {/* Balance by currency */}
        <Card>
          <p className="mb-3 text-sm font-medium text-slate-400">
            {t("balance_by_currency")}
          </p>
          <div className="space-y-2">
            {Object.entries(byCurrency).map(([currency, balance]) => (
              <div key={currency} className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <span className="text-sm text-slate-300">{currency}</span>
                </div>
                <div className="shrink-0">
                  <MoneyAmount
                    amount={balance}
                    currency={currency}
                    className={`text-sm ${Number(balance) < 0 ? "text-red-400" : "text-slate-100"}`}
                  />
                </div>
              </div>
            ))}
            {Object.keys(byCurrency).length === 0 && (
              <p className="text-sm text-slate-500">{tc("empty")}</p>
            )}
          </div>
        </Card>

        {/* Charts row */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <p className="mb-3 text-sm font-medium text-slate-400">
              {t("income_vs_expenses")}
            </p>
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

        {/* Recent transactions */}
        <Card>
          <p className="mb-3 text-sm font-medium text-slate-400">
            {t("recent_transactions")}
          </p>
          {recent.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">{tc("empty")}</p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {recent.map((tx) => (
                <li key={tx.id} className="flex items-start justify-between gap-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-200">
                      {tx.category ?? tx.note ?? "—"}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatDate(tx.transaction_date)}
                    </p>
                  </div>
                  <div className="shrink-0">
                    <MoneyAmount
                      amount={tx.type === "expense" ? -tx.amount : tx.amount}
                      currency={tx.currency}
                      className={`text-sm ${tx.type === "expense" ? "text-red-400" : "text-emerald-400"}`}
                    />
                  </div>
                </li>
              ))}
            </ul>
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
                      className="text-sm text-slate-100"
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
    </PageWrapper>
  );
}

const DEFAULT_RATE_MAP: Record<string, number> = Object.fromEntries(
  DEFAULT_CURRENCIES.map((c) => [c.code, c.rate_to_usd])
);

function resolveRate(currency: string, ratesByCode: Record<string, number | string | null>): number {
  return getValidRate(ratesByCode[currency]) ?? DEFAULT_RATE_MAP[currency] ?? 1;
}

function buildMonthData(
  transactions: { type: string; amount: number; currency: string; transaction_date: string }[],
  ratesByCode: Record<string, number | string | null>
) {
  const months: Record<string, { income: number; expenses: number }> = {};
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
    months[key] = { income: 0, expenses: 0 };
  }
  const displayRate = resolveRate("USD", ratesByCode);
  transactions.forEach((tx) => {
    const d = new Date(tx.transaction_date);
    const key = d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
    if (!months[key]) return;
    const usd = (Number(tx.amount) * resolveRate(tx.currency, ratesByCode)) / displayRate;
    if (tx.type === "income") months[key].income += usd;
    else months[key].expenses += usd;
  });
  return Object.entries(months).map(([month, v]) => ({ month, ...v }));
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
      const cat = tx.category ?? "Divers dépenses";
      cats[cat] = (cats[cat] ?? 0) + (Number(tx.amount) * resolveRate(tx.currency, ratesByCode)) / displayRate;
    });
  return Object.entries(cats).map(([name, value]) => ({ name, value }));
}
