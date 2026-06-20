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
  Plus, ChevronDown, ChevronUp,
  AlertCircle, AlertTriangle, Info, X,
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
// Sheets (kept from existing — unchanged)
// ─────────────────────────────────────────────────────────────────────────────

type ClientRow = { name: string; received: number; costs: number; refunds: number; profit: number; balance: number };

function FormulaSheet({ open, onClose, physicalBalance, clientMoney, debtOwed, personalEst }: {
  open: boolean; onClose: () => void;
  physicalBalance: number; clientMoney: number; debtOwed: number; personalEst: number;
}) {
  if (!open) return null;
  const rows = [
    { label: "Solde physique total", value: physicalBalance, hint: "Tout l'argent réellement présent." },
    { label: "− Argent client détenu", value: -clientMoney, hint: "Reçu des clients, pas encore ton bénéfice." },
    { label: "− Dettes à payer", value: -debtOwed, hint: "Montant total à rembourser." },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-t-2xl border border-slate-800 bg-slate-900 md:rounded-xl">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h3 className="text-sm font-semibold text-slate-100">Calcul du solde personnel</h3>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800"><X size={16} /></button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <p className="text-xs text-slate-500">Les créances à recevoir ne sont pas incluses — cet argent n'est pas encore dans tes comptes.</p>
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.label} className="flex items-start justify-between gap-3">
                <div><p className="text-sm text-slate-300">{r.label}</p><p className="text-xs text-slate-600">{r.hint}</p></div>
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

function DebtListSheet({ open, onClose, title, debts: items, totalUSD, color, ratesByCode, locale }: {
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
                const isOverdue = d.due_date ? new Date(d.due_date) < now : false;
                return (
                  <li key={d.id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-200">{d.person_name}</span>
                          {isOverdue && <Badge variant="danger">En retard</Badge>}
                        </div>
                        <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-500">
                          <span>Total : {formatMoney(Number(d.amount), d.currency)}</span>
                          {Number(d.paid_amount) > 0 && <span>Payé : {formatMoney(Number(d.paid_amount), d.currency)}</span>}
                          {d.due_date && <span>Échéance : {formatDate(d.due_date)}</span>}
                        </div>
                      </div>
                      <span className={`shrink-0 font-mono text-sm font-bold tabular-nums ${color === "red" ? "text-red-400" : "text-emerald-400"}`}>
                        {formatMoney(remaining, d.currency)}
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
          <Link href={`/${locale}/debts`} onClick={onClose}
            className="mt-3 flex w-full items-center justify-center rounded-lg border border-slate-700 py-2 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200">
            Gérer dans Dettes & Créances →
          </Link>
        </div>
      </div>
    </div>
  );
}

function MonthlyDetailSheet({ open, onClose, title, items, total, note }: {
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
                  <div className="min-w-0 flex-1"><p className="truncate text-sm text-slate-200">{item.label}</p><p className="text-xs text-slate-500">{item.date}</p></div>
                  <p className="shrink-0 font-mono text-sm font-semibold tabular-nums text-slate-100">{formatMoney(item.amount, item.currency)}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-slate-800 px-5 py-4">
          <span className="text-sm font-medium text-slate-400">Total</span>
          <span className="font-mono text-base font-bold tabular-nums text-slate-50">{formatMoney(total, "USD")}</span>
        </div>
      </div>
    </div>
  );
}

function ClientBreakdownSheet({ open, onClose, rows, totalHeld, locale }: {
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
          Argent reçu des clients, après coûts et bénéfice validé. Ne t'appartient pas encore.
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
                    <span className={`shrink-0 font-mono text-sm font-bold tabular-nums ${r.balance < 0 ? "text-red-400" : "text-sky-300"}`}>
                      {formatMoney(r.balance, "USD")}
                    </span>
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-slate-500">
                    <span>Reçu : <span className="text-slate-400">{formatMoney(r.received, "USD")}</span></span>
                    <span>Coûts : <span className="text-red-400">−{formatMoney(r.costs, "USD")}</span></span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-slate-800 px-5 py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-slate-400">Total détenu</span>
            <span className="font-mono text-base font-bold tabular-nums text-sky-300">{formatMoney(totalHeld, "USD")}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

type DashPeriod = "week" | "month" | "3months" | "6months" | "year";

function filterByPeriod(transactions: ReturnType<typeof useTransactions>["transactions"], period: DashPeriod) {
  const now = new Date();
  return transactions.filter((tx) => {
    const d = new Date(tx.transaction_date);
    if (period === "week") { const c = new Date(now); c.setDate(c.getDate() - 7); return d >= c; }
    if (period === "month") return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    if (period === "3months") { const c = new Date(now); c.setMonth(c.getMonth() - 3); return d >= c; }
    if (period === "6months") { const c = new Date(now); c.setMonth(c.getMonth() - 6); return d >= c; }
    if (period === "year") return d.getFullYear() === now.getFullYear();
    return true;
  });
}

function availLabel(av: string | null | undefined): string {
  if (av === "distant") return "Éloigné";
  if (av === "blocked") return "Bloqué";
  if (av === "close") return "Proche";
  return "Immédiat";
}

function tileCls(extra = "") {
  return `rounded-xl border border-slate-800 bg-slate-900 p-4 ${extra}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
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
  const criticalAlerts = useMemo(() => smartAlerts.filter((a) => a.severity === "critical"), [smartAlerts]);
  const highAlerts = useMemo(() => smartAlerts.filter((a) => a.severity === "high"), [smartAlerts]);
  const actionableAlerts = useMemo(
    () => (criticalAlerts.length > 0 ? criticalAlerts : highAlerts.slice(0, 3)),
    [criticalAlerts, highAlerts]
  );

  const [chartsOpen, setChartsOpen] = useState(false);
  const [chartPeriod, setChartPeriod] = useState<DashPeriod>("month");
  const [chartAccountId, setChartAccountId] = useState<string | null>(null);

  type SheetKind = "physical" | "client" | "formula" | "debts" | "receivables" | "income" | "expense" | "profit" | null;
  const [openSheet, setOpenSheet] = useState<SheetKind>(null);
  const close = () => setOpenSheet(null);

  // ── Chart data ──────────────────────────────────────────────────────────

  const chartSourceTxs = useMemo(
    () => chartAccountId ? transactions.filter((tx) => tx.account_id === chartAccountId) : transactions,
    [transactions, chartAccountId]
  );
  const periodTxs = useMemo(() => filterByPeriod(chartSourceTxs, chartPeriod), [chartSourceTxs, chartPeriod]);
  const chartData = useMemo(
    () => buildRealMoneyChart(chartSourceTxs, ratesByCode, chartPeriod as ChartPeriod),
    [chartSourceTxs, ratesByCode, chartPeriod]
  );
  const categoryData = useMemo(() => buildRealExpenseCategories(periodTxs, ratesByCode), [periodTxs, ratesByCode]);
  const isChartEmpty = useMemo(() => chartData.every((d) => d.income === 0 && d.expenses === 0), [chartData]);

  // ── Month detail drawers data ───────────────────────────────────────────

  const now = new Date();
  const thisMonthTxs = useMemo(
    () => transactions.filter((tx) => {
      const d = new Date(tx.transaction_date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [transactions]
  );
  const realIncomeTxs = useMemo(() => thisMonthTxs.filter(isRealIncome).map((tx) => ({
    label: tx.category ?? tx.note ?? "—", amount: toUSD(Number(tx.amount), tx.currency, ratesByCode), currency: "USD", date: formatDate(tx.transaction_date),
  })), [thisMonthTxs, ratesByCode]);
  const realExpenseTxs = useMemo(() => thisMonthTxs.filter(isRealExpense).map((tx) => ({
    label: tx.category ?? tx.note ?? "—", amount: toUSD(Number(tx.amount), tx.currency, ratesByCode), currency: "USD", date: formatDate(tx.transaction_date),
  })), [thisMonthTxs, ratesByCode]);
  const profitTxs = useMemo(() => thisMonthTxs.filter((tx) => tx.sub_type === "profit_validated").map((tx) => ({
    label: tx.category ?? tx.note ?? "Bénéfice validé", amount: toUSD(Number(tx.amount), tx.currency, ratesByCode), currency: "USD", date: formatDate(tx.transaction_date),
  })), [thisMonthTxs, ratesByCode]);

  // ── Client breakdown ────────────────────────────────────────────────────

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
      else if (tx.sub_type === "client_product_purchase" || tx.sub_type === "client_shipping_fee" || tx.sub_type === "shared_client_fee") row.costs += usd;
      else if (tx.sub_type === "client_refund") row.refunds += usd;
      else if (tx.sub_type === "profit_validated") row.profit += usd;
    }
    const result: ClientRow[] = [];
    for (const row of map.values()) { row.balance = row.received - row.costs - row.refunds - row.profit; if (row.received > 0 || row.costs > 0) result.push(row); }
    return result.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
  }, [transactions, clients, ratesByCode]);

  // ── Debt lists ──────────────────────────────────────────────────────────

  const openDebts = useMemo(() => debts.filter((d) => d.direction === "i_owe" && d.status !== "paid"), [debts]);
  const openReceivables = useMemo(() => debts.filter((d) => d.direction === "owes_me" && d.status !== "paid"), [debts]);

  // ── Account items for physical drawer ───────────────────────────────────

  const allAccountItems = useMemo((): DetailItem[] =>
    accounts.map((a) => ({
      name: a.name, subtitle: availLabel(a.availability),
      originalAmount: Number(a.balance), currency: a.currency,
      convertedAmount: toUSD(Number(a.balance), a.currency, ratesByCode),
      isPositive: Number(a.balance) >= 0,
    })), [accounts, ratesByCode]
  );

  // ── Derived values ──────────────────────────────────────────────────────

  const availableBalance = physicalBalance.total - clientMoney.netHeldUSD;
  const recentTx = useMemo(() => transactions.slice(0, 5), [transactions]);

  // ── Loading ─────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <PageWrapper locale={locale}>
        <div className="space-y-4">
          <div className="h-9 w-48 animate-pulse rounded-lg bg-slate-800" />
          <div className="grid grid-cols-3 gap-3">
            {[...Array(3)].map((_, i) => (
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

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <PageWrapper locale={locale}>
      <div className="space-y-4">

        {/* ══════════════════════════════════════════════════════════════════
            1. REQUIRES ACTION — Alertes critiques (only if critical)
            ══════════════════════════════════════════════════════════════════ */}
        {!alertsLoading && actionableAlerts.length > 0 && (
          <section className="space-y-1.5">
            <SectionHeader label={criticalAlerts.length > 0 ? "Nécessite ton attention" : "À surveiller"} />
            {actionableAlerts.map((alert) => {
              const isCritical = alert.severity === "critical";
              const Icon = isCritical ? AlertCircle : AlertTriangle;
              const color = isCritical ? "text-red-400" : "text-orange-400";
              const bg = isCritical ? "border-red-900/30 bg-red-950/10" : "border-orange-900/20 bg-orange-950/5";
              const tp = (alert.titleParams as Record<string, string>) ?? {};
              const titleName = tp.clientName ?? tp.orderName ?? tp.person ?? "";
              const baseLabel = ALERT_TYPE_LABELS[alert.type] ?? alert.type;
              const title = titleName ? `${baseLabel} : ${titleName}` : baseLabel;
              return (
                <Link key={alert.id} href={`/${locale}${alert.actionHref}`}
                  className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:border-slate-600 ${bg}`}>
                  <Icon size={14} className={`shrink-0 ${color}`} />
                  <span className="flex-1 truncate text-xs text-slate-300">{title}</span>
                  {isCritical && <Badge variant="danger" className="text-[10px]">Critique</Badge>}
                  <span className="shrink-0 text-xs text-slate-600">→</span>
                </Link>
              );
            })}
            {smartAlerts.length > actionableAlerts.length && (
              <Link href={`/${locale}/alerts`}
                className="flex items-center justify-center rounded-lg border border-slate-800 py-1.5 text-[11px] text-slate-500 transition-colors hover:bg-slate-900 hover:text-slate-300">
                Voir les {smartAlerts.length} alertes →
              </Link>
            )}
          </section>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            2. APERÇU — Personal balance (clean, no fluff)
            ══════════════════════════════════════════════════════════════════ */}
        <button
          onClick={() => setOpenSheet("formula")}
          className="card-interactive relative w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-5 text-left"
        >
          <div className="absolute -right-4 -top-4 h-24 w-24 rounded-full bg-orange-500/5 blur-2xl" />
          <div className="relative flex items-end justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-600">
                Solde personnel estimé
              </p>
              <p className="mt-1 font-mono text-3xl font-bold tabular-nums text-slate-50">
                {personalBalanceEstimate < 0 && "−"}
                {formatMoney(Math.abs(personalBalanceEstimate), "USD")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {clientMoney.netHeldUSD > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-800/70 px-2.5 py-1 text-[11px]">
                  <span className="font-mono text-sky-400">{formatMoney(clientMoney.netHeldUSD, "USD")}</span>
                  <span className="text-slate-500">client</span>
                </span>
              )}
              {debtOverview.totalOwedUSD > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-800/70 px-2.5 py-1 text-[11px]">
                  <span className="font-mono text-red-400">{formatMoney(debtOverview.totalOwedUSD, "USD")}</span>
                  <span className="text-slate-500">dettes</span>
                </span>
              )}
              <span className="text-[10px] text-slate-600">Détails →</span>
            </div>
          </div>
        </button>

        {/* ══════════════════════════════════════════════════════════════════
            3. VUE RÉELLE — Physical / Client / Available
            ══════════════════════════════════════════════════════════════════ */}
        <section>
          <SectionHeader label="Vue réelle" />
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => setOpenSheet("physical")} className={`card-interactive ${tileCls()} text-left`}>
              <p className="text-[11px] font-medium text-slate-500">Physique</p>
              <p className="mt-1.5 font-mono text-lg font-bold tabular-nums text-slate-100">
                {formatMoney(physicalBalance.total, "USD")}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-600">{accounts.length} comptes</p>
            </button>

            <button onClick={() => setOpenSheet("client")} className={`card-interactive ${tileCls()} text-left`}>
              <p className="text-[11px] font-medium text-slate-500">Client détenu</p>
              <p className={`mt-1.5 font-mono text-lg font-bold tabular-nums ${clientMoney.netHeldUSD < 0 ? "text-red-400" : "text-sky-300"}`}>
                {formatMoney(clientMoney.netHeldUSD, "USD")}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-600">Non validé</p>
            </button>

            <div className={tileCls()}>
              <p className="text-[11px] font-medium text-slate-500">Disponible</p>
              <p className={`mt-1.5 font-mono text-lg font-bold tabular-nums ${availableBalance < 0 ? "text-red-400" : "text-emerald-400"}`}>
                {formatMoney(availableBalance, "USD")}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-600">Physique − client</p>
            </div>
          </div>

          {/* Obligations — compact below */}
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button onClick={() => setOpenSheet("debts")} className="card-interactive flex items-center justify-between gap-2 rounded-lg border border-slate-800/70 bg-slate-900/70 px-3 py-2.5 text-left">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500/70" />
                <span className="text-[11px] font-medium text-slate-500">Dettes à payer</span>
              </div>
              <MoneyAmount amount={debtOverview.totalOwedUSD} currency="USD" tone="negative" size="sm" />
            </button>
            <button onClick={() => setOpenSheet("receivables")} className="card-interactive flex items-center justify-between gap-2 rounded-lg border border-slate-800/70 bg-slate-900/70 px-3 py-2.5 text-left">
              <div className="flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500/70" />
                <span className="text-[11px] font-medium text-slate-500">Créances à recevoir</span>
              </div>
              <MoneyAmount amount={debtOverview.totalReceivableUSD} currency="USD" tone="positive" size="sm" />
            </button>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════════
            4. ACTIONS RAPIDES
            ══════════════════════════════════════════════════════════════════ */}
        <section>
          <div className="flex gap-2">
            <Link href={`/${locale}/transactions`}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-700/60 bg-slate-900 py-3 text-sm font-medium text-slate-300 transition-colors hover:border-orange-500/30 hover:bg-slate-800 hover:text-slate-100">
              <Plus size={15} className="text-orange-500" />
              Transaction
            </Link>
            <Link href={`/${locale}/clients`}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-700/60 bg-slate-900 py-3 text-sm font-medium text-slate-300 transition-colors hover:border-orange-500/30 hover:bg-slate-800 hover:text-slate-100">
              <Plus size={15} className="text-orange-500" />
              Client
            </Link>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════════
            5. RÉSULTAT DU MOIS
            ══════════════════════════════════════════════════════════════════ */}
        <section>
          <SectionHeader label="Ce mois" />
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => setOpenSheet("income")}
              className="card-interactive rounded-xl border border-slate-800/60 bg-slate-900/60 p-3 text-left"
              style={{ borderTop: "2px solid rgba(52,211,153,0.25)" }}>
              <p className="text-[11px] font-medium text-slate-500">Revenus</p>
              <MoneyAmount amount={monthlyMetrics.realIncomeUSD} currency="USD" tone="positive" size="md" className="mt-1.5" />
            </button>
            <button onClick={() => setOpenSheet("expense")}
              className="card-interactive rounded-xl border border-slate-800/60 bg-slate-900/60 p-3 text-left"
              style={{ borderTop: "2px solid rgba(248,113,113,0.25)" }}>
              <p className="text-[11px] font-medium text-slate-500">Dépenses</p>
              <MoneyAmount amount={monthlyMetrics.realExpenseUSD} currency="USD" tone={monthlyMetrics.realExpenseUSD > 0 ? "negative" : "muted"} size="md" className="mt-1.5" />
            </button>
            <button onClick={() => setOpenSheet("profit")}
              className="card-interactive rounded-xl border border-slate-800/60 bg-slate-900/60 p-3 text-left"
              style={{ borderTop: "2px solid rgba(251,146,60,0.25)" }}>
              <p className="text-[11px] font-medium text-slate-500">Bénéfice</p>
              <MoneyAmount amount={monthlyMetrics.profitValidatedUSD} currency="USD" tone="warning" size="md" className="mt-1.5" />
            </button>
          </div>
        </section>

        {/* ══════════════════════════════════════════════════════════════════
            6. GRAPHIQUES — Collapsible
            ══════════════════════════════════════════════════════════════════ */}
        <section>
          <button
            onClick={() => setChartsOpen(!chartsOpen)}
            className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-900 px-4 py-3 text-left transition-colors hover:border-slate-700"
          >
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Graphiques</span>
            <span className="flex items-center gap-2 text-xs text-slate-600">
              <select
                value={chartAccountId ?? ""}
                onChange={(e) => { e.stopPropagation(); setChartAccountId(e.target.value || null); }}
                onClick={(e) => e.stopPropagation()}
                className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300 focus:border-orange-500 focus:outline-none"
              >
                <option value="">Tous</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <select
                value={chartPeriod}
                onChange={(e) => { e.stopPropagation(); setChartPeriod(e.target.value as DashPeriod); }}
                onClick={(e) => e.stopPropagation()}
                className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300 focus:border-orange-500 focus:outline-none"
              >
                <option value="week">Semaine</option>
                <option value="month">Mois</option>
                <option value="3months">3 mois</option>
                <option value="6months">6 mois</option>
                <option value="year">Année</option>
              </select>
              {chartsOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </span>
          </button>

          {chartsOpen && (
            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              <Card>
                {isChartEmpty ? (
                  <div className="flex h-[180px] items-center justify-center">
                    <p className="text-sm text-slate-600">{t("no_real_data")}</p>
                  </div>
                ) : (
                  <ExpenseChart data={chartData} currency="USD" />
                )}
              </Card>
              <Card>
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
          )}
        </section>

        {/* ══════════════════════════════════════════════════════════════════
            7. TRANSACTIONS RÉCENTES
            ══════════════════════════════════════════════════════════════════ */}
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
                    const isClientCost = tx.sub_type === "client_product_purchase" || tx.sub_type === "client_shipping_fee" || tx.sub_type === "shared_client_fee";
                    const tone = isInc ? "positive" : isExp ? "negative" : isClient ? "client" : isClientCost ? "warning" : "muted";
                    const sign = tx.type === "income" ? "+" : "−";
                    return (
                      <li key={tx.id} className={`flex items-center justify-between gap-3 px-4 py-2.5${i >= 3 ? " hidden sm:flex" : ""}`}>
                        <div className="flex min-w-0 flex-1 items-center gap-2.5">
                          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${tx.type === "expense" ? "bg-red-950/60 text-red-400" : "bg-emerald-950/60 text-emerald-400"}`}>{sign}</span>
                          <div className="min-w-0">
                            <p className="truncate text-sm text-slate-200">{tx.category ?? tx.note ?? "—"}</p>
                            <p className="text-[11px] text-slate-600">
                              {acc?.name ?? (tx.account_id === null ? "Comptabilité" : "—")} · {formatDate(tx.transaction_date)}
                            </p>
                          </div>
                        </div>
                        <MoneyAmount amount={tx.type === "expense" ? -tx.amount : tx.amount} currency={tx.currency} tone={tone} size="sm" />
                      </li>
                    );
                  })}
                </ul>
                {transactions.length > 3 && (
                  <div className="border-t border-slate-800/60 px-4 py-2.5">
                    <Link href={`/${locale}/transactions`} className="flex items-center justify-center text-xs text-slate-500 transition-colors hover:text-orange-400">
                      {tc("see_all")} ({transactions.length}) →
                    </Link>
                  </div>
                )}
              </>
            )}
          </Card>
        </section>
      </div>

      {/* ── Sheets (unchanged) ───────────────────────────────────────────────── */}

      <BalanceDetailSheet open={openSheet === "physical"} title="Solde physique total" items={allAccountItems} total={physicalBalance.total} displayCurrency="USD" onClose={close} />
      <ClientBreakdownSheet open={openSheet === "client"} onClose={close} rows={clientBreakdown} totalHeld={clientMoney.netHeldUSD} locale={locale} />
      <FormulaSheet open={openSheet === "formula"} onClose={close} physicalBalance={physicalBalance.total} clientMoney={clientMoney.netHeldUSD} debtOwed={debtOverview.totalOwedUSD} personalEst={personalBalanceEstimate} />
      <DebtListSheet open={openSheet === "debts"} onClose={close} title="Dettes à payer" debts={openDebts} totalUSD={debtOverview.totalOwedUSD} color="red" ratesByCode={ratesByCode} locale={locale} />
      <DebtListSheet open={openSheet === "receivables"} onClose={close} title="Créances à recevoir" debts={openReceivables} totalUSD={debtOverview.totalReceivableUSD} color="green" ratesByCode={ratesByCode} locale={locale} />
      <MonthlyDetailSheet open={openSheet === "income"} onClose={close} title="Revenus réels — ce mois" items={realIncomeTxs} total={monthlyMetrics.realIncomeUSD} note="Inclut : revenu personnel, business, bénéfice validé. Exclut : argent client, remboursements de dettes." />
      <MonthlyDetailSheet open={openSheet === "expense"} onClose={close} title="Dépenses réelles — ce mois" items={realExpenseTxs} total={monthlyMetrics.realExpenseUSD} note="Inclut : dépenses personnelles et business. Exclut : achats pour clients, remboursements." />
      <MonthlyDetailSheet open={openSheet === "profit"} onClose={close} title="Bénéfice validé — ce mois" items={profitTxs} total={monthlyMetrics.profitValidatedUSD} note="Conversion d'argent client en revenu business réel. Inclus dans les revenus réels." />
    </PageWrapper>
  );
}
