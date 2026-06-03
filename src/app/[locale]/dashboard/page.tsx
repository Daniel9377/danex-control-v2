"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useTransactions } from "@/hooks/useTransactions";
import { useAccounts } from "@/hooks/useAccounts";
import { useClients } from "@/hooks/useClients";
import { useDebts } from "@/hooks/useDebts";
import { useFinancialOverview } from "@/hooks/useFinancialOverview";
import { useFinancialAlerts } from "@/hooks/useFinancialAlerts";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Card } from "@/components/ui/Card";
import { MetricCard } from "@/components/ui/MetricCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { MoneyAmount } from "@/components/ui/MoneyAmount";
import { Badge } from "@/components/ui/Badge";
import { ExpenseChart } from "@/components/charts/ExpenseChart";
import { CategoryPie } from "@/components/charts/CategoryPie";
import { BalanceDetailSheet, type DetailItem } from "@/components/ui/BalanceDetailSheet";
import { formatMoney, getValidRate, DEFAULT_CURRENCIES } from "@/lib/currency";
import { formatDate } from "@/lib/utils";
import {
  buildRealMoneyChart,
  buildRealExpenseCategories,
  isRealIncome,
  isRealExpense,
  type ChartPeriod,
} from "@/lib/financial-calculations";
import { use, useMemo, useState } from "react";
import {
  TrendingUp, TrendingDown, Users, Wallet, AlertCircle, AlertTriangle,
  ArrowUpRight, ArrowDownRight, Info, X, CheckCircle,
} from "lucide-react";
import type { Debt } from "@/lib/supabase/types";

type Props = { params: Promise<{ locale: string }> };

const ALERT_TYPE_LABELS: Record<string, string> = {
  client_deficit: "Déficit client",
  order_deficit: "Commande déficitaire",
  order_no_purchase: "Argent reçu sans achat",
  order_stale: "Commande inactive",
  debt_overdue: "Dette en retard",
  debt_due_soon: "Dette bientôt échue",
  receivable_overdue: "Créance en retard",
  receivable_due_soon: "Créance bientôt échue",
  personal_balance_negative: "Solde personnel négatif",
  legacy_unprocessed: "Transactions non reclassifiées",
  orphan_transaction: "Transaction sans compte",
  duplicate_suspected: "Doublons potentiels",
  excessive_corrections: "Corrections fréquentes",
  client_money_stale: "Argent client inactif",
};

const DEFAULT_RATE_MAP: Record<string, number> = Object.fromEntries(
  DEFAULT_CURRENCIES.map((c) => [c.code, c.rate_to_usd])
);

function resolveRate(currency: string, ratesByCode: Record<string, number | string | null>): number {
  return getValidRate(ratesByCode[currency]) ?? DEFAULT_RATE_MAP[currency] ?? 1;
}

function toUSD(amount: number, currency: string, ratesByCode: Record<string, number | string | null>): number {
  return amount * resolveRate(currency, ratesByCode);
}

// ─────────────────────────────────────────────────────────────────────────────
// Sheet: Solde personnel — formule
// ─────────────────────────────────────────────────────────────────────────────

function FormulaSheet({
  open, onClose, physicalBalance, clientMoney, debtOwed, personalEst,
}: {
  open: boolean; onClose: () => void;
  physicalBalance: number; clientMoney: number; debtOwed: number; personalEst: number;
}) {
  if (!open) return null;
  const rows = [
    { label: "Solde physique total", value: physicalBalance, hint: "Tout l'argent réellement présent dans tes comptes." },
    { label: "− Argent client détenu", value: -clientMoney, hint: "Argent reçu des clients qui n'est pas encore ton bénéfice." },
    { label: "− Dettes à payer", value: -debtOwed, hint: "Montant total que tu dois rembourser." },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-t-2xl border border-slate-800 bg-slate-900 md:rounded-xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-100">Comment est calculé le solde personnel ?</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800"><X size={16} /></button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <p className="text-xs text-slate-500">
            Estimation — les <strong className="text-slate-300">créances à recevoir</strong> ne sont pas incluses
            car cet argent n'est pas encore dans tes comptes.
          </p>
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.label} className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-slate-300">{r.label}</p>
                  <p className="text-xs text-slate-600">{r.hint}</p>
                </div>
                <span className={`shrink-0 font-mono text-sm font-semibold tabular-nums ${r.value < 0 ? "text-red-400" : "text-slate-100"}`}>
                  {formatMoney(Math.abs(r.value), "USD")}
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-slate-700 pt-3">
            <span className="text-sm font-semibold text-slate-200">= Solde personnel estimé</span>
            <span className={`font-mono text-base font-bold tabular-nums ${personalEst < 0 ? "text-red-400" : "text-emerald-400"}`}>
              {formatMoney(personalEst, "USD")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sheet: Détail transactions mensuelles (revenus / dépenses)
// ─────────────────────────────────────────────────────────────────────────────

function MonthlyDetailSheet({
  open, onClose, title, items, total, note,
}: {
  open: boolean; onClose: () => void;
  title: string; items: { label: string; amount: number; currency: string; date: string }[];
  total: number; note?: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-t-2xl border border-slate-800 bg-slate-900 md:rounded-xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800"><X size={16} /></button>
        </div>
        {note && <p className="border-b border-slate-800/50 px-5 py-2 text-xs text-slate-500">{note}</p>}
        <div className="max-h-[55vh] overflow-y-auto px-5 py-3">
          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Aucune transaction ce mois-ci.</p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {items.map((item, i) => (
                <li key={i} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-slate-200">{item.label}</p>
                    <p className="text-xs text-slate-500">{item.date}</p>
                  </div>
                  <p className="shrink-0 font-mono text-sm font-semibold tabular-nums text-slate-100">
                    {formatMoney(item.amount, item.currency)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-slate-800 px-5 py-4">
          <span className="text-sm font-medium text-slate-400">Total</span>
          <span className={`font-mono text-base font-bold tabular-nums ${total < 0 ? "text-red-400" : "text-slate-50"}`}>
            {formatMoney(total, "USD")}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sheet: Argent client — détail par client
// ─────────────────────────────────────────────────────────────────────────────

type ClientRow = { name: string; received: number; costs: number; refunds: number; profit: number; balance: number };

function ClientBreakdownSheet({
  open, onClose, rows, totalHeld, locale,
}: {
  open: boolean; onClose: () => void; rows: ClientRow[]; totalHeld: number; locale: string;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-t-2xl border border-slate-800 bg-slate-900 md:rounded-xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-100">Argent client détenu</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800"><X size={16} /></button>
        </div>
        <p className="border-b border-slate-800/50 px-5 py-2 text-xs text-slate-500">
          Argent reçu des clients, après déduction des coûts, remboursements et bénéfice validé.
          Cet argent ne t'appartient pas encore.
        </p>
        <div className="max-h-[50vh] overflow-y-auto px-5 py-3">
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Aucun client avec de l'argent en attente.</p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {rows.map((r) => (
                <li key={r.name} className="py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-slate-200">{r.name}</span>
                    <span className={`shrink-0 font-mono text-sm font-bold tabular-nums ${
                      r.balance < 0 ? "text-red-400" : r.balance === 0 ? "text-slate-500" : "text-sky-300"
                    }`}>
                      {formatMoney(r.balance, "USD")}
                    </span>
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-slate-500">
                    <span>Reçu : <span className="text-slate-400">{formatMoney(r.received, "USD")}</span></span>
                    <span>Coûts : <span className="text-red-400">−{formatMoney(r.costs, "USD")}</span></span>
                    {r.refunds > 0 && <span>Remboursé : <span className="text-amber-400">−{formatMoney(r.refunds, "USD")}</span></span>}
                    {r.profit > 0 && <span>Bénéfice validé : <span className="text-orange-400">−{formatMoney(r.profit, "USD")}</span></span>}
                  </div>
                  {r.balance < 0 && (
                    <p className="mt-1 flex items-center gap-1 text-xs text-red-400">
                      <AlertCircle size={10} /> Déficit — coûts supérieurs aux montants reçus
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-slate-800 px-5 py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-400">Total détenu</span>
            <span className={`font-mono text-base font-bold tabular-nums ${totalHeld < 0 ? "text-red-400" : "text-sky-300"}`}>
              {formatMoney(totalHeld, "USD")}
            </span>
          </div>
          <p className="mt-2 text-[10px] text-slate-600">
            ⓘ Les frais partagés entre plusieurs clients sont approximatifs ici.
            Pour le détail exact, voir{" "}
            <Link href={`/${locale}/reports`} onClick={onClose} className="text-slate-500 underline hover:text-orange-400">
              Rapports
            </Link>
            {" "}ou{" "}
            <Link href={`/${locale}/clients`} onClick={onClose} className="text-slate-500 underline hover:text-orange-400">
              Clients
            </Link>.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Sheet: Dettes / Créances
// ─────────────────────────────────────────────────────────────────────────────

function DebtListSheet({
  open, onClose, title, debts: items, totalUSD, color, ratesByCode, locale,
}: {
  open: boolean; onClose: () => void; title: string;
  debts: Debt[]; totalUSD: number; color: "red" | "green";
  ratesByCode: Record<string, number | string | null>; locale: string;
}) {
  if (!open) return null;
  const now = new Date();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-t-2xl border border-slate-800 bg-slate-900 md:rounded-xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800"><X size={16} /></button>
        </div>
        <div className="max-h-[50vh] overflow-y-auto px-5 py-3">
          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">Aucun élément.</p>
          ) : (
            <ul className="divide-y divide-slate-800">
              {items.map((d) => {
                const remaining = Number(d.amount) - Number(d.paid_amount);
                const remainingUSD = toUSD(remaining, d.currency, ratesByCode);
                const isOverdue = d.due_date ? new Date(d.due_date) < now : false;
                const paidPct = d.amount > 0 ? Math.round((Number(d.paid_amount) / Number(d.amount)) * 100) : 0;
                return (
                  <li key={d.id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-200">{d.person_name}</span>
                          {isOverdue && <Badge variant="danger">En retard</Badge>}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                          <span>Initial : {formatMoney(Number(d.amount), d.currency)}</span>
                          {Number(d.paid_amount) > 0 && <span>Payé : {formatMoney(Number(d.paid_amount), d.currency)} ({paidPct}%)</span>}
                          {d.due_date && <span>Échéance : {formatDate(d.due_date)}</span>}
                          {d.note && <span className="text-slate-600">{d.note}</span>}
                        </div>
                      </div>
                      <span className={`shrink-0 font-mono text-sm font-bold tabular-nums ${color === "red" ? "text-red-400" : "text-emerald-400"}`}>
                        {formatMoney(remaining, d.currency)}
                        {d.currency !== "USD" && (
                          <span className="ml-1 text-xs font-normal text-slate-500">≈{formatMoney(remainingUSD, "USD")}</span>
                        )}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="border-t border-slate-800 px-5 py-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-400">Total restant</span>
            <span className={`font-mono text-base font-bold tabular-nums ${color === "red" ? "text-red-400" : "text-emerald-400"}`}>
              {formatMoney(totalUSD, "USD")}
            </span>
          </div>
          <Link
            href={`/${locale}/debts`}
            onClick={onClose}
            className="mt-3 flex w-full items-center justify-center rounded-lg border border-slate-700 py-2 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          >
            Gérer dans Dettes & Créances →
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Period filter helpers
// ─────────────────────────────────────────────────────────────────────────────

type DashPeriod = "week" | "month" | "3months" | "6months" | "year";

function filterByPeriod(
  transactions: ReturnType<typeof useTransactions>["transactions"],
  period: DashPeriod
) {
  const now = new Date();
  return transactions.filter((tx) => {
    const d = new Date(tx.transaction_date);
    if (period === "week") {
      const cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - 7);
      return d >= cutoff;
    }
    if (period === "month") {
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }
    if (period === "3months") {
      const cutoff = new Date(now);
      cutoff.setMonth(cutoff.getMonth() - 3);
      return d >= cutoff;
    }
    if (period === "6months") {
      const cutoff = new Date(now);
      cutoff.setMonth(cutoff.getMonth() - 6);
      return d >= cutoff;
    }
    if (period === "year") {
      return d.getFullYear() === now.getFullYear();
    }
    return true;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Availability label
// ─────────────────────────────────────────────────────────────────────────────

function availLabel(av: string | null | undefined): string {
  if (av === "distant") return "Éloigné";
  if (av === "blocked") return "Bloqué";
  if (av === "close") return "Proche";
  return "Immédiat";
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export default function DashboardPage({ params }: Props) {
  const { locale } = use(params);
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");

  const { transactions } = useTransactions();
  const { accounts } = useAccounts();
  const { clients } = useClients();
  const { debts } = useDebts();

  const {
    loading,
    physicalBalance,
    personalBalanceEstimate,
    clientMoney,
    debtOverview,
    monthlyMetrics,
    ratesByCode,
  } = useFinancialOverview();

  const { alerts: smartAlerts, loading: alertsLoading } = useFinancialAlerts();
  const topAlerts = useMemo(() => smartAlerts.slice(0, 3), [smartAlerts]);
  const criticalAlertCount = useMemo(() => smartAlerts.filter((a) => a.severity === "critical").length, [smartAlerts]);

  const [chartPeriod, setChartPeriod] = useState<DashPeriod>("month");
  const [chartAccountId, setChartAccountId] = useState<string | null>(null);
  const [chartTab, setChartTab] = useState<"flux" | "categories">("flux");

  type SheetKind =
    | "physical" | "client" | "formula"
    | "debts" | "receivables"
    | "income" | "expense" | "profit"
    | null;
  const [openSheet, setOpenSheet] = useState<SheetKind>(null);
  const close = () => setOpenSheet(null);

  // ── Chart source transactions (account filter + period) ─────────────────

  const chartSourceTxs = useMemo(
    () => chartAccountId
      ? transactions.filter((tx) => tx.account_id === chartAccountId)
      : transactions,
    [transactions, chartAccountId]
  );

  const periodTxs = useMemo(
    () => filterByPeriod(chartSourceTxs, chartPeriod),
    [chartSourceTxs, chartPeriod]
  );

  const chartData = useMemo(
    () => buildRealMoneyChart(chartSourceTxs, ratesByCode, chartPeriod as ChartPeriod),
    [chartSourceTxs, ratesByCode, chartPeriod]
  );

  const categoryData = useMemo(
    () => buildRealExpenseCategories(periodTxs, ratesByCode),
    [periodTxs, ratesByCode]
  );

  const isChartEmpty = useMemo(
    () => chartData.every((d) => d.income === 0 && d.expenses === 0),
    [chartData]
  );

  // ── Recent transactions ────────────────────────────────────────────────

  const recentTx = useMemo(() => transactions.slice(0, 5), [transactions]);

  // ── Monthly income / expense drawers ──────────────────────────────────

  const now = new Date();
  const thisMonthTxs = useMemo(
    () => transactions.filter((tx) => {
      const d = new Date(tx.transaction_date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions]
  );

  const realIncomeTxs = useMemo(
    () => thisMonthTxs.filter(isRealIncome).map((tx) => ({
      label: tx.category ?? tx.note ?? "—",
      amount: toUSD(Number(tx.amount), tx.currency, ratesByCode),
      currency: "USD",
      date: formatDate(tx.transaction_date),
    })),
    [thisMonthTxs, ratesByCode]
  );

  const realExpenseTxs = useMemo(
    () => thisMonthTxs.filter(isRealExpense).map((tx) => ({
      label: tx.category ?? tx.note ?? "—",
      amount: toUSD(Number(tx.amount), tx.currency, ratesByCode),
      currency: "USD",
      date: formatDate(tx.transaction_date),
    })),
    [thisMonthTxs, ratesByCode]
  );

  const profitTxs = useMemo(
    () => thisMonthTxs
      .filter((tx) => tx.sub_type === "profit_validated")
      .map((tx) => ({
        label: tx.category ?? tx.note ?? "Bénéfice validé",
        amount: toUSD(Number(tx.amount), tx.currency, ratesByCode),
        currency: "USD",
        date: formatDate(tx.transaction_date),
      })),
    [thisMonthTxs, ratesByCode]
  );

  // ── Client breakdown for drawer ────────────────────────────────────────

  const clientBreakdown = useMemo((): ClientRow[] => {
    const map = new Map<string, ClientRow>();
    for (const tx of transactions) {
      if (!tx.client_id) continue;
      if (!map.has(tx.client_id)) {
        const client = clients.find((c) => c.id === tx.client_id);
        if (!client) continue;
        map.set(tx.client_id, { name: client.name, received: 0, costs: 0, refunds: 0, profit: 0, balance: 0 });
      }
      const row = map.get(tx.client_id)!;
      const usd = toUSD(Number(tx.amount), tx.currency, ratesByCode);
      if (tx.sub_type === "client_money_received") row.received += usd;
      else if (
        tx.sub_type === "client_product_purchase" ||
        tx.sub_type === "client_shipping_fee" ||
        tx.sub_type === "shared_client_fee"
      ) row.costs += usd;
      else if (tx.sub_type === "client_refund") row.refunds += usd;
      else if (tx.sub_type === "profit_validated") row.profit += usd;
    }
    const result: ClientRow[] = [];
    for (const row of map.values()) {
      row.balance = row.received - row.costs - row.refunds - row.profit;
      if (row.received > 0 || row.costs > 0) result.push(row);
    }
    return result.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
  }, [transactions, clients, ratesByCode]);

  // ── Raw debt/receivable lists for drawers ─────────────────────────────

  const openDebts = useMemo(
    () => debts.filter((d) => d.direction === "i_owe" && d.status !== "paid"),
    [debts]
  );
  const openReceivables = useMemo(
    () => debts.filter((d) => d.direction === "owes_me" && d.status !== "paid"),
    [debts]
  );

  // ── Account items for physical drawer ─────────────────────────────────

  const allAccountItems = useMemo((): DetailItem[] =>
    accounts.map((a) => ({
      name: a.name,
      subtitle: availLabel(a.availability),
      originalAmount: Number(a.balance),
      currency: a.currency,
      convertedAmount: toUSD(Number(a.balance), a.currency, ratesByCode),
      isPositive: Number(a.balance) >= 0,
    })),
    [accounts, ratesByCode]
  );

  // ── Hero card derived state ───────────────────────────────────────────

  const heroIsDanger = personalBalanceEstimate < 0;
  const heroIsWarning = !heroIsDanger && criticalAlertCount > 0;
  const heroState = heroIsDanger ? "Situation fragile" : heroIsWarning ? "Attention requise" : "Situation stable";
  const heroPhrase = heroIsDanger
    ? "Ton argent disponible est négatif après retrait de l'argent client et des dettes."
    : heroIsWarning
    ? `${criticalAlertCount} alerte${criticalAlertCount > 1 ? "s" : ""} critique${criticalAlertCount > 1 ? "s" : ""} détectée${criticalAlertCount > 1 ? "s" : ""} — vérifie les alertes.`
    : "Situation sous contrôle. Aucune alerte critique détectée.";
  const heroAccentColor = heroIsDanger ? "text-red-400" : heroIsWarning ? "text-orange-400" : "text-emerald-400";
  const heroBorderColor = heroIsDanger ? "border-red-800/40" : heroIsWarning ? "border-orange-700/30" : "border-emerald-800/25";
  const heroBgFrom = heroIsDanger ? "from-red-950/25" : heroIsWarning ? "from-orange-950/15" : "from-emerald-950/15";
  const heroGlowStyle = heroIsDanger
    ? { boxShadow: "0 0 40px -10px rgba(239,68,68,0.15)" }
    : heroIsWarning
    ? { boxShadow: "0 0 40px -10px rgba(249,115,22,0.12)" }
    : { boxShadow: "0 0 40px -10px rgba(16,185,129,0.10)" };
  const heroDotBg = heroIsDanger ? "bg-red-500" : heroIsWarning ? "bg-orange-500" : "bg-emerald-500";

  // ── Loading ────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <PageWrapper locale={locale}>
        <div className="space-y-6">
          <div className="h-7 w-40 animate-pulse rounded-lg bg-slate-800" />
          <div className="grid grid-cols-3 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="rounded-xl border border-slate-800 bg-slate-900 p-4">
                <div className="mb-2 h-3 w-16 animate-pulse rounded bg-slate-800" />
                <div className="h-6 w-24 animate-pulse rounded bg-slate-800" />
              </div>
            ))}
          </div>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper locale={locale}>
      <div className="space-y-5">

        {/* ── Hero Card ──────────────────────────────────────────────────── */}
        <div
          className={`relative overflow-hidden rounded-2xl border ${heroBorderColor} bg-gradient-to-br ${heroBgFrom} via-slate-900/95 to-slate-900 p-5`}
          style={heroGlowStyle}
        >
          <div className={`absolute -right-6 -top-6 h-28 w-28 rounded-full blur-3xl opacity-20 ${heroDotBg}`} />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-stretch">

            {/* Left: main content */}
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3 sm:block">
                <div>
                  <p className={`text-[11px] font-semibold uppercase tracking-widest ${heroAccentColor}`}>
                    {heroState}
                  </p>
                  <p className={`mt-1 font-mono text-3xl font-bold tabular-nums sm:text-4xl ${personalBalanceEstimate < 0 ? "text-red-400" : "text-slate-50"}`}>
                    {personalBalanceEstimate < 0 && <span className="text-2xl sm:text-3xl">−</span>}
                    {formatMoney(Math.abs(personalBalanceEstimate), "USD")}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-slate-500">{heroPhrase}</p>
                </div>
                {/* Mobile: inline Détails button */}
                <button
                  onClick={() => setOpenSheet("formula")}
                  className="sm:hidden shrink-0 rounded-lg border border-slate-700/60 bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
                >
                  Détails
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-800/70 px-2.5 py-1 text-xs">
                  <span className="font-mono text-sky-400">{formatMoney(clientMoney.netHeldUSD, "USD")}</span>
                  <span className="text-slate-500">client</span>
                </span>
                {debtOverview.totalOwedUSD > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-800/70 px-2.5 py-1 text-xs">
                    <span className="font-mono text-red-400">{formatMoney(debtOverview.totalOwedUSD, "USD")}</span>
                    <span className="text-slate-500">dettes</span>
                  </span>
                )}
                {smartAlerts.length > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-800/70 px-2.5 py-1 text-xs">
                    <span className={`font-mono ${criticalAlertCount > 0 ? "text-red-400" : "text-slate-400"}`}>
                      {smartAlerts.length}
                    </span>
                    <span className="text-slate-500">alertes</span>
                  </span>
                )}
              </div>
            </div>

            {/* Desktop right panel: mini balance summary */}
            <div className="hidden sm:flex sm:w-44 sm:shrink-0 sm:flex-col sm:justify-between sm:border-l sm:border-slate-800/50 sm:pl-5">
              <div className="space-y-2.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">Résumé</p>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-500">Physique</span>
                  <span className={`font-mono font-semibold tabular-nums ${physicalBalance.total < 0 ? "text-red-400" : "text-slate-200"}`}>
                    {formatMoney(physicalBalance.total, "USD")}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-500">Client</span>
                  <span className="font-mono font-semibold tabular-nums text-sky-400">
                    {formatMoney(clientMoney.netHeldUSD, "USD")}
                  </span>
                </div>
                {debtOverview.totalOwedUSD > 0 && (
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-500">Dettes</span>
                    <span className="font-mono font-semibold tabular-nums text-red-400">
                      −{formatMoney(debtOverview.totalOwedUSD, "USD")}
                    </span>
                  </div>
                )}
              </div>
              <button
                onClick={() => setOpenSheet("formula")}
                className="mt-3 w-full rounded-lg border border-slate-700/60 bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:bg-slate-700 hover:text-white"
              >
                Détails →
              </button>
            </div>
          </div>
        </div>

        {/* ── Section 1 — Vue réelle ─────────────────────────────────────── */}
        <section>
          <SectionHeader label={t("section_real")} />
          <div className="grid grid-cols-2 gap-3">

            {/* Solde physique */}
            <button
              onClick={() => setOpenSheet("physical")}
              className="card-interactive rounded-xl border border-slate-800 bg-slate-900 p-4 text-left"
            >
              <p className="text-xs font-medium text-slate-500">{t("physical_balance")}</p>
              <p className={`mt-1.5 font-mono text-xl font-bold tabular-nums ${physicalBalance.total < 0 ? "text-red-400" : "text-slate-100"}`}>
                {formatMoney(physicalBalance.total, "USD")}
              </p>
              <p className="mt-1 text-[11px] text-slate-600">
                {accounts.length} compte{accounts.length !== 1 ? "s" : ""}
                {physicalBalance.hasMissing && " · taux manquant"}
              </p>
            </button>

            {/* Argent client */}
            <button
              onClick={() => setOpenSheet("client")}
              className="card-interactive rounded-xl border border-slate-800 bg-slate-900 p-4 text-left"
            >
              <p className="text-xs font-medium text-slate-500">{t("client_held")}</p>
              <p className={`mt-1.5 font-mono text-xl font-bold tabular-nums ${clientMoney.netHeldUSD < 0 ? "text-red-400" : "text-sky-300"}`}>
                {formatMoney(clientMoney.netHeldUSD, "USD")}
              </p>
              <p className="mt-1 text-[11px] text-slate-600">Non validé</p>
            </button>
          </div>
        </section>

        {/* ── Section 2 — Obligations ────────────────────────────────────── */}
        <section>
          <SectionHeader label={t("section_obligations")} />
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setOpenSheet("debts")}
              className="card-interactive rounded-lg border border-slate-800/70 bg-slate-900/70 px-3 py-2.5 text-left"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500/70" />
                  <p className="text-[11px] font-medium text-slate-500">{t("debts_owed")}</p>
                </div>
                <ArrowUpRight size={11} className="shrink-0 text-slate-600" />
              </div>
              <p className={`mt-1.5 font-mono text-sm font-bold tabular-nums ${debtOverview.totalOwedUSD > 0 ? "text-red-400" : "text-slate-400"}`}>
                {formatMoney(debtOverview.totalOwedUSD, "USD")}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-600">
                {openDebts.length > 0
                  ? `${openDebts.length} en cours${debtOverview.overdueDebts.length > 0 ? ` · ${debtOverview.overdueDebts.length} expirée${debtOverview.overdueDebts.length > 1 ? "s" : ""}` : ""}`
                  : "Aucune dette"}
              </p>
            </button>

            <button
              onClick={() => setOpenSheet("receivables")}
              className="card-interactive rounded-lg border border-slate-800/70 bg-slate-900/70 px-3 py-2.5 text-left"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500/70" />
                  <p className="text-[11px] font-medium text-slate-500">{t("receivables")}</p>
                </div>
                <ArrowDownRight size={11} className="shrink-0 text-slate-600" />
              </div>
              <p className={`mt-1.5 font-mono text-sm font-bold tabular-nums ${debtOverview.totalReceivableUSD > 0 ? "text-emerald-400" : "text-slate-400"}`}>
                {formatMoney(debtOverview.totalReceivableUSD, "USD")}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-600">
                {openReceivables.length > 0
                  ? `${openReceivables.length} en cours${debtOverview.overdueReceivables.length > 0 ? ` · ${debtOverview.overdueReceivables.length} expirée${debtOverview.overdueReceivables.length > 1 ? "s" : ""}` : ""}`
                  : "Aucune créance"}
              </p>
            </button>
          </div>
        </section>

        {/* ── Section 3 — Résultat du mois ───────────────────────────────── */}
        <section>
          <SectionHeader label={t("section_month")} />
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setOpenSheet("income")}
              className="card-interactive rounded-xl border border-slate-800/60 bg-slate-900/60 p-3.5 text-left"
              style={{ borderTop: "2px solid rgba(52,211,153,0.25)" }}
            >
              <p className="text-[11px] font-medium leading-tight text-slate-500">{t("month_real_income")}</p>
              <p className="mt-2 font-mono text-base font-bold tabular-nums text-emerald-400">
                {formatMoney(monthlyMetrics.realIncomeUSD, "USD")}
              </p>
            </button>
            <button
              onClick={() => setOpenSheet("expense")}
              className="card-interactive rounded-xl border border-slate-800/60 bg-slate-900/60 p-3.5 text-left"
              style={{ borderTop: "2px solid rgba(248,113,113,0.25)" }}
            >
              <p className="text-[11px] font-medium leading-tight text-slate-500">{t("month_real_expense")}</p>
              <p className={`mt-2 font-mono text-base font-bold tabular-nums ${monthlyMetrics.realExpenseUSD > 0 ? "text-red-400" : "text-slate-400"}`}>
                {formatMoney(monthlyMetrics.realExpenseUSD, "USD")}
              </p>
            </button>
            <button
              onClick={() => setOpenSheet("profit")}
              className="card-interactive rounded-xl border border-slate-800/60 bg-slate-900/60 p-3.5 text-left"
              style={{ borderTop: "2px solid rgba(251,146,60,0.25)" }}
            >
              <p className="text-[11px] font-medium leading-tight text-slate-500">{t("month_profit_validated")}</p>
              <p className="mt-2 font-mono text-base font-bold tabular-nums text-orange-400">
                {formatMoney(monthlyMetrics.profitValidatedUSD, "USD")}
              </p>
            </button>
          </div>
        </section>

        {/* ── Section 4 — Graphiques ─────────────────────────────────────── */}
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <SectionHeader label={t("real_chart")} />
            <div className="flex items-center gap-2">
              <select
                value={chartAccountId ?? ""}
                onChange={(e) => setChartAccountId(e.target.value || null)}
                className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300 focus:border-orange-500 focus:outline-none"
              >
                <option value="">Tous les comptes</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <select
                value={chartPeriod}
                onChange={(e) => setChartPeriod(e.target.value as DashPeriod)}
                className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300 focus:border-orange-500 focus:outline-none"
              >
                <option value="week">Cette semaine</option>
                <option value="month">Ce mois</option>
                <option value="3months">3 mois</option>
                <option value="6months">6 mois</option>
                <option value="year">Cette année</option>
              </select>
            </div>
          </div>

          {/* Mobile tab: Flux / Catégories */}
          <div className="mb-3 flex rounded-lg border border-slate-800 bg-slate-950 p-0.5 sm:hidden">
            <button
              onClick={() => setChartTab("flux")}
              className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${chartTab === "flux" ? "bg-slate-800 text-slate-100" : "text-slate-500 hover:text-slate-300"}`}
            >
              Flux
            </button>
            <button
              onClick={() => setChartTab("categories")}
              className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-colors ${chartTab === "categories" ? "bg-slate-800 text-slate-100" : "text-slate-500 hover:text-slate-300"}`}
            >
              Catégories
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className={chartTab === "categories" ? "hidden sm:block" : undefined}>
              {isChartEmpty ? (
                <div className="flex h-[180px] items-center justify-center">
                  <p className="text-sm text-slate-600">{t("no_real_data")}</p>
                </div>
              ) : (
                <ExpenseChart data={chartData} currency="USD" />
              )}
            </Card>
            <Card className={chartTab === "flux" ? "hidden sm:block" : undefined}>
              <p className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-500">
                {t("real_expenses_by_category")}
              </p>
              {categoryData.length > 0 ? (
                <CategoryPie data={categoryData} currency="USD" />
              ) : (
                <div className="flex h-[180px] items-center justify-center">
                  <p className="text-sm text-slate-600">{t("no_real_expenses_month")}</p>
                </div>
              )}
            </Card>
          </div>
        </section>

        {/* ── Section 5 — Alertes ────────────────────────────────────────── */}
        {!alertsLoading && topAlerts.length > 0 && (
          <section>
            <SectionHeader label={t("section_alerts")} />
            <div className="space-y-1.5">
              {topAlerts.map((alert) => {
                const isCritical = alert.severity === "critical";
                const isHigh = alert.severity === "high";
                const Icon = isCritical ? AlertCircle : isHigh ? AlertTriangle : Info;
                const color = isCritical ? "text-red-400" : isHigh ? "text-orange-400" : "text-sky-400";
                const bg = isCritical
                  ? "border-red-900/30 bg-red-950/10"
                  : isHigh
                  ? "border-orange-900/20 bg-orange-950/5"
                  : "border-slate-800 bg-slate-900/50";
                const tp = alert.titleParams as Record<string, string>;
                const titleName = tp.clientName ?? tp.orderName ?? tp.person ?? "";
                const baseLabel = ALERT_TYPE_LABELS[alert.type] ?? alert.type;
                const title = titleName ? `${baseLabel} : ${titleName}` : baseLabel;
                return (
                  <div key={alert.id} className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${bg}`}>
                    <Icon size={13} className={`shrink-0 ${color}`} />
                    <span className="flex-1 truncate text-xs text-slate-300">{title}</span>
                    {isCritical && (
                      <span className="shrink-0 rounded-full bg-red-950/50 px-1.5 py-0.5 text-[10px] font-semibold text-red-400">
                        Critique
                      </span>
                    )}
                    <Link
                      href={`/${locale}${alert.actionHref}`}
                      className="shrink-0 text-[11px] text-slate-600 transition-colors hover:text-orange-400"
                    >
                      →
                    </Link>
                  </div>
                );
              })}
              <Link
                href={`/${locale}/alerts`}
                className="flex w-full items-center justify-center rounded-lg border border-slate-800 py-2 text-xs text-slate-500 transition-colors hover:bg-slate-900 hover:text-slate-300"
              >
                Voir toutes les alertes ({smartAlerts.length}) →
              </Link>
            </div>
          </section>
        )}

        {/* ── Section 6 — Transactions récentes ──────────────────────────── */}
        <section>
          <Card className="overflow-hidden p-0">
            <div className="flex items-center border-b border-slate-800 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                {t("recent_transactions")}
              </p>
            </div>
            {recentTx.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">{tc("empty")}</p>
            ) : (
              <>
                <ul className="divide-y divide-slate-800/60">
                  {recentTx.map((tx, i) => {
                    const acc = accounts.find((a) => a.id === tx.account_id);
                    const isInc = isRealIncome(tx);
                    const isExp = isRealExpense(tx);
                    const isClient = tx.sub_type === "client_money_received";
                    const isClientCost =
                      tx.sub_type === "client_product_purchase" ||
                      tx.sub_type === "client_shipping_fee" ||
                      tx.sub_type === "shared_client_fee";
                    const amountColor = isInc
                      ? "text-emerald-400"
                      : isExp
                      ? "text-red-400"
                      : isClient
                      ? "text-sky-400"
                      : isClientCost
                      ? "text-amber-400"
                      : "text-slate-400";
                    const sign = tx.type === "income" ? "+" : "−";
                    return (
                      <li
                        key={tx.id}
                        className={`flex items-center justify-between gap-3 px-4 py-2.5${i >= 3 ? " hidden sm:flex" : ""}`}
                      >
                        <div className="flex min-w-0 flex-1 items-center gap-2.5">
                          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${tx.type === "expense" ? "bg-red-950/60 text-red-400" : "bg-emerald-950/60 text-emerald-400"}`}>
                            {sign}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate text-sm text-slate-200">{tx.category ?? tx.note ?? "—"}</p>
                            <p className="text-[11px] text-slate-600">
                              {acc?.name ?? (tx.account_id === null ? "Comptabilité" : "—")} · {formatDate(tx.transaction_date)}
                              {tx.sub_type === null && <span className="ml-1 opacity-40">legacy</span>}
                            </p>
                          </div>
                        </div>
                        <MoneyAmount
                          amount={tx.type === "expense" ? -tx.amount : tx.amount}
                          currency={tx.currency}
                          className={`shrink-0 font-mono tabular-nums text-sm ${amountColor}`}
                        />
                      </li>
                    );
                  })}
                </ul>
                {transactions.length > 3 && (
                  <div className="border-t border-slate-800/60 px-4 py-2.5">
                    <Link
                      href={`/${locale}/transactions`}
                      className="flex items-center justify-center text-xs text-slate-500 transition-colors hover:text-orange-400"
                    >
                      {tc("see_all")} ({transactions.length}) →
                    </Link>
                  </div>
                )}
              </>
            )}
          </Card>
        </section>
      </div>

      {/* ── Drawers ─────────────────────────────────────────────────────────── */}

      <BalanceDetailSheet
        open={openSheet === "physical"}
        title={t("physical_balance")}
        items={allAccountItems}
        total={physicalBalance.total}
        displayCurrency="USD"
        onClose={close}
      />

      <ClientBreakdownSheet
        open={openSheet === "client"}
        onClose={close}
        rows={clientBreakdown}
        totalHeld={clientMoney.netHeldUSD}
        locale={locale}
      />

      <FormulaSheet
        open={openSheet === "formula"}
        onClose={close}
        physicalBalance={physicalBalance.total}
        clientMoney={clientMoney.netHeldUSD}
        debtOwed={debtOverview.totalOwedUSD}
        personalEst={personalBalanceEstimate}
      />

      <DebtListSheet
        open={openSheet === "debts"}
        onClose={close}
        title={t("debts_owed")}
        debts={openDebts}
        totalUSD={debtOverview.totalOwedUSD}
        color="red"
        ratesByCode={ratesByCode}
        locale={locale}
      />

      <DebtListSheet
        open={openSheet === "receivables"}
        onClose={close}
        title={t("receivables")}
        debts={openReceivables}
        totalUSD={debtOverview.totalReceivableUSD}
        color="green"
        ratesByCode={ratesByCode}
        locale={locale}
      />

      <MonthlyDetailSheet
        open={openSheet === "income"}
        onClose={close}
        title={`${t("month_real_income")} — ce mois`}
        items={realIncomeTxs}
        total={monthlyMetrics.realIncomeUSD}
        note="Inclut : revenu personnel, business, bénéfice validé. Exclut : argent client, remboursements de dettes."
      />

      <MonthlyDetailSheet
        open={openSheet === "expense"}
        onClose={close}
        title={`${t("month_real_expense")} — ce mois`}
        items={realExpenseTxs}
        total={monthlyMetrics.realExpenseUSD}
        note="Inclut : dépenses personnelles et business. Exclut : achats pour clients, remboursements."
      />

      <MonthlyDetailSheet
        open={openSheet === "profit"}
        onClose={close}
        title={`${t("month_profit_validated")} — ce mois`}
        items={profitTxs}
        total={monthlyMetrics.profitValidatedUSD}
        note="Transactions qui convertissent l'argent client en revenu business réel. Ce montant est inclus dans les revenus réels."
      />
    </PageWrapper>
  );
}
