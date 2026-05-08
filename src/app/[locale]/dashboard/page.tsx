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
import { LoadingPage } from "@/components/ui/LoadingSpinner";
import { BalanceChart } from "@/components/charts/BalanceChart";
import { ExpenseChart } from "@/components/charts/ExpenseChart";
import { CategoryPie } from "@/components/charts/CategoryPie";
import { sumAccountsInCurrency } from "@/lib/currency";
import { formatDate, isOverdue } from "@/lib/utils";
import { use } from "react";

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
  const { ratesByCode } = useCurrencies();

  if (accountsLoading || txLoading || debtsLoading) return (
    <PageWrapper locale={locale}>
      <LoadingPage />
    </PageWrapper>
  );

  const { total: totalUSD, hasMissing } = sumAccountsInCurrency(
    accounts,
    "USD",
    ratesByCode
  );

  // Balance by currency
  const byCurrency = accounts.reduce<Record<string, number>>((acc, a) => {
    acc[a.currency] = (acc[a.currency] ?? 0) + Number(a.balance);
    return acc;
  }, {});

  // Recent 5 transactions
  const recent = transactions.slice(0, 5);

  // Active debts (unpaid/partial)
  const activeDebts = debts.filter((d) => d.status !== "paid").slice(0, 5);

  // Unread alerts
  const unreadAlerts = alerts.filter((a) => !a.is_read);

  // Build expense chart data (last 6 months)
  const monthData = buildMonthData(transactions);

  // Category breakdown this month
  const categoryData = buildCategoryData(transactions);

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
            <ExpenseChart data={monthData} />
          </Card>
          <Card>
            <p className="mb-3 text-sm font-medium text-slate-400">
              {t("expenses_by_category")}
            </p>
            {categoryData.length > 0 ? (
              <CategoryPie data={categoryData} />
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

function buildMonthData(transactions: { type: string; amount: number; transaction_date: string }[]) {
  const months: Record<string, { income: number; expenses: number }> = {};
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
    months[key] = { income: 0, expenses: 0 };
  }
  transactions.forEach((tx) => {
    const d = new Date(tx.transaction_date);
    const key = d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
    if (!months[key]) return;
    if (tx.type === "income") months[key].income += Number(tx.amount);
    else months[key].expenses += Number(tx.amount);
  });
  return Object.entries(months).map(([month, v]) => ({ month, ...v }));
}

function buildCategoryData(transactions: { type: string; amount: number; category: string | null; transaction_date: string }[]) {
  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();
  const cats: Record<string, number> = {};
  transactions
    .filter((tx) => {
      const d = new Date(tx.transaction_date);
      return tx.type === "expense" && d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    })
    .forEach((tx) => {
      const cat = tx.category ?? "Autre";
      cats[cat] = (cats[cat] ?? 0) + Number(tx.amount);
    });
  return Object.entries(cats).map(([name, value]) => ({ name, value }));
}
