"use client";

import { useState, useMemo, use } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useFinancialReports } from "@/hooks/useFinancialReports";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { formatMoney } from "@/lib/currency";
import { formatDate } from "@/lib/utils";
import {
  isLegacy,
  toUSD,
  computeRealResult,
  computeTreasury,
  computeClientReport,
  computeOrderReport,
} from "@/lib/financial-calculations";
import type { Transaction } from "@/lib/supabase/types";
import { TrendingUp, TrendingDown, AlertCircle, ExternalLink, Search } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { MetricCard } from "@/components/ui/MetricCard";
import { EmptyState } from "@/components/ui/EmptyState";

type Props = { params: Promise<{ locale: string }> };
type Period = "month" | "last_month" | "year" | "all" | "custom";
type Tab =
  | "real_result"
  | "treasury"
  | "client_money"
  | "per_client"
  | "per_order"
  | "debts"
  | "legacy";

// ── Period filter ─────────────────────────────────────────────────────────────

function inPeriod(
  dateStr: string,
  period: Period,
  from: string,
  to: string
): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  if (period === "month") {
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }
  if (period === "last_month") {
    const p = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return d.getMonth() === p.getMonth() && d.getFullYear() === p.getFullYear();
  }
  if (period === "year") {
    return d.getFullYear() === now.getFullYear();
  }
  if (period === "custom" && from && to) {
    return d >= new Date(from) && d <= new Date(`${to}T23:59:59`);
  }
  return true;
}

// ── Layout helpers ────────────────────────────────────────────────────────────

interface ReportRowProps {
  label: string;
  value: number;
  indent?: boolean;
  bold?: boolean;
  color?: "default" | "green" | "red" | "orange";
  note?: string;
  separator?: boolean;
}

function ReportRow({ label, value, indent, bold, color = "default", note, separator }: ReportRowProps) {
  const colorClass =
    color === "green" ? "text-emerald-400"
    : color === "red" ? "text-red-400"
    : color === "orange" ? "text-[var(--brand-text)]"
    : "text-[var(--text-strong)]";

  return (
    <>
      {separator && <div className="my-2 border-t border-[var(--border-default)]" />}
      <div className={`flex items-center justify-between gap-4 py-1.5 ${indent ? "pl-4" : ""}`}>
        <div className="min-w-0">
          <p className={`text-sm ${bold ? "font-semibold text-[var(--text-strong)]" : "text-[var(--text-muted)]"}`}>
            {label}
          </p>
          {note && <p className="text-[10px] text-[var(--text-faint)]">{note}</p>}
        </div>
        <p className={`shrink-0 font-mono text-sm tabular-nums ${bold ? "font-bold" : ""} ${colorClass}`}>
          {value >= 0 ? "+" : ""}
          {formatMoney(Math.abs(value), "USD")}
          {value < 0 ? " (−)" : ""}
        </p>
      </div>
    </>
  );
}

function AmountCell({ value, currency = "USD" }: { value: number; currency?: string }) {
  const color =
    value > 0 ? "text-emerald-400" : value < 0 ? "text-red-400" : "text-[var(--text-label)]";
  return (
    <span className={`font-mono text-xs tabular-nums ${color}`}>
      {formatMoney(Math.abs(value), currency)}
    </span>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ReportsPage({ params }: Props) {
  const { locale } = use(params);
  const t = useTranslations("reports");
  const tc = useTranslations("common");

  const {
    loading,
    transactions,
    clients,
    orders,
    debts,
    allocations,
    ratesByCode,
  } = useFinancialReports();

  const [activeTab, setActiveTab] = useState<Tab>("real_result");
  const [period, setPeriod] = useState<Period>("month");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [includeLegacy, setIncludeLegacy] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [orderSearch, setOrderSearch] = useState("");

  const TABS: { key: Tab; label: string }[] = [
    { key: "real_result", label: t("tab_real_result") },
    { key: "treasury", label: t("tab_treasury") },
    { key: "client_money", label: t("tab_client_money") },
    { key: "per_client", label: t("tab_per_client") },
    { key: "per_order", label: t("tab_per_order") },
    { key: "debts", label: t("tab_debts") },
    { key: "legacy", label: t("tab_legacy") },
  ];

  // ── Filtered transaction sets ─────────────────────────────────────────────

  const filteredTx = useMemo<Transaction[]>(() => {
    let txs = transactions.filter((tx) =>
      inPeriod(tx.transaction_date, period, fromDate, toDate)
    );
    if (!includeLegacy) txs = txs.filter((tx) => !isLegacy(tx));
    return txs;
  }, [transactions, period, fromDate, toDate, includeLegacy]);

  // ── Section 1: Résultat réel ──────────────────────────────────────────────

  const realResult = useMemo(
    () => computeRealResult(filteredTx, ratesByCode),
    [filteredTx, ratesByCode]
  );

  // ── Section 2: Trésorerie ─────────────────────────────────────────────────

  const treasury = useMemo(
    () => computeTreasury(filteredTx, ratesByCode),
    [filteredTx, ratesByCode]
  );

  // ── Section 3: Argent client ──────────────────────────────────────────────

  const clientMoney = useMemo(() => {
    let received = 0, productCost = 0, fees = 0, sharedFees = 0, refunds = 0, profit = 0;
    for (const tx of filteredTx) {
      const usd = toUSD(Number(tx.amount), tx.currency, ratesByCode);
      if (tx.sub_type === "client_money_received") received += usd;
      else if (tx.sub_type === "client_product_purchase") productCost += usd;
      else if (tx.sub_type === "client_shipping_fee") fees += usd;
      else if (tx.sub_type === "shared_client_fee") sharedFees += usd;
      else if (tx.sub_type === "client_refund") refunds += usd;
      else if (tx.sub_type === "profit_validated") profit += usd;
    }
    const allocTotal = allocations.reduce(
      (s, a) => s + toUSD(Number(a.allocated_amount), a.currency, ratesByCode),
      0
    );
    return {
      received, productCost, fees,
      sharedFees: sharedFees + allocTotal,
      refunds, profit,
      balance: received - productCost - fees - sharedFees - allocTotal - refunds - profit,
    };
  }, [filteredTx, allocations, ratesByCode]);

  // ── Section 4: Par client ─────────────────────────────────────────────────

  const clientReports = useMemo(() => {
    const search = clientSearch.toLowerCase();
    return clients
      .filter((c) => !search || c.name.toLowerCase().includes(search))
      .map((c) => computeClientReport(c.id, c.name, filteredTx, allocations, ratesByCode))
      .filter((r) => r.receivedUSD > 0 || r.productCostUSD > 0 || r.profitValidatedUSD > 0);
  }, [clients, filteredTx, allocations, ratesByCode, clientSearch]);

  // ── Section 5: Par commande ───────────────────────────────────────────────

  const orderReports = useMemo(() => {
    const clientMap = new Map(clients.map((c) => [c.id, c.name]));
    const search = orderSearch.toLowerCase();
    return orders
      .filter((o) => !search || o.product_name.toLowerCase().includes(search))
      .map((o) =>
        computeOrderReport(o, clientMap.get(o.client_id) ?? "—", filteredTx, ratesByCode)
      )
      .filter((r) => r.receivedUSD > 0 || r.productCostUSD > 0);
  }, [orders, clients, filteredTx, ratesByCode, orderSearch]);

  // ── Section 6: Dettes & créances ─────────────────────────────────────────

  const debtSections = useMemo(() => {
    const now = new Date();
    const myDebts = debts.filter((d) => d.direction === "i_owe" && d.status !== "paid");
    const receivables = debts.filter((d) => d.direction === "owes_me" && d.status !== "paid");
    const isOverdue = (d: typeof debts[0]) => d.due_date ? new Date(d.due_date) < now : false;
    const totalOwedUSD = myDebts.reduce(
      (s, d) => s + toUSD(Number(d.amount) - Number(d.paid_amount), d.currency, ratesByCode), 0
    );
    const totalReceivableUSD = receivables.reduce(
      (s, d) => s + toUSD(Number(d.amount) - Number(d.paid_amount), d.currency, ratesByCode), 0
    );
    return { myDebts, receivables, isOverdue, totalOwedUSD, totalReceivableUSD };
  }, [debts, ratesByCode]);

  // ── Section 7: Legacy ─────────────────────────────────────────────────────

  const legacySummary = useMemo(() => {
    const legacyTxs = transactions.filter(
      (tx) => isLegacy(tx) && inPeriod(tx.transaction_date, period, fromDate, toDate)
    );
    const classified = legacyTxs.filter((tx) => tx.accounting_type !== null);
    const unclassified = legacyTxs.filter((tx) => tx.accounting_type === null);
    const totalIncomeUSD = legacyTxs
      .filter((tx) => tx.type === "income")
      .reduce((s, tx) => s + toUSD(Number(tx.amount), tx.currency, ratesByCode), 0);
    const totalExpenseUSD = legacyTxs
      .filter((tx) => tx.type === "expense")
      .reduce((s, tx) => s + toUSD(Number(tx.amount), tx.currency, ratesByCode), 0);
    return {
      total: legacyTxs.length,
      classifiedCount: classified.length,
      unclassifiedCount: unclassified.length,
      totalIncomeUSD,
      totalExpenseUSD,
      recent: legacyTxs.slice(0, 8),
    };
  }, [transactions, period, fromDate, toDate, ratesByCode]);

  // ── Loading ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <PageWrapper locale={locale}>
        <div className="space-y-4">
          <div className="h-7 w-32 animate-pulse rounded-lg bg-[var(--surface-chip)]" />
          <div className="h-10 w-full animate-pulse rounded-lg bg-[var(--surface-chip)]" />
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-[var(--surface-chip)]" />
            ))}
          </div>
        </div>
      </PageWrapper>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <PageWrapper locale={locale}>
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-[var(--text-strong)]">{t("title")}</h1>

        {/* ── Period filter ── */}
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-1.5">
            {([
              { value: "month",      label: t("period_month") },
              { value: "last_month", label: t("period_last_month") },
              { value: "year",       label: t("period_year") },
              { value: "all",        label: t("period_all") },
              { value: "custom",     label: t("period_custom") },
            ] as const).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                  period === opt.value
                    ? "border-[var(--brand-fill)]/60 bg-[var(--indigo-950)]/40 text-[var(--brand-text)]"
                    : "border-[var(--border-strong)] text-[var(--text-label)] hover:border-[var(--border-strong)] hover:text-[var(--text-body)]"
                }`}
              >
                {opt.label}
              </button>
            ))}
            <label className="ml-auto flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={includeLegacy}
                onChange={(e) => setIncludeLegacy(e.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--brand)]"
              />
              <span className="text-xs text-[var(--text-faint)]">{t("include_legacy")}</span>
            </label>
          </div>

          {period === "custom" && (
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="mb-1 block text-[11px] text-[var(--text-label)]">{t("from_date")}</label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-3 py-2 text-sm text-[var(--text-strong)] focus:border-[var(--brand)]/70 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-[var(--text-label)]">{t("to_date")}</label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-3 py-2 text-sm text-[var(--text-strong)] focus:border-[var(--brand)]/70 focus:outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* ── KPI summary ── */}
        {filteredTx.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MetricCard
              label="Net résultat"
              value={realResult.netResultUSD}
              currency="USD"
              color={realResult.netResultUSD >= 0 ? "green" : "red"}
              note="≈ USD · revenus − dépenses réelles"
            />
            <MetricCard
              label="Revenus réels"
              value={realResult.totalRealIncomeUSD}
              currency="USD"
              color="green"
              note={`Personnel + Business${realResult.profitValidatedUSD > 0 ? " + Bénéfices" : ""}`}
            />
            <MetricCard
              label="Dépenses réelles"
              value={realResult.totalRealExpenseUSD}
              currency="USD"
              color="red"
              note="Personnel + Business"
            />
          </div>
        )}

        {/* ── Tab bar ── */}
        <div className="flex gap-0.5 overflow-x-auto rounded-xl border border-[var(--border-default)] bg-[var(--bg-app)] p-1">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                activeTab === key
                  ? "bg-[var(--surface-chip)] text-[var(--text-strong)] shadow-sm"
                  : "text-[var(--text-label)] hover:text-[var(--text-body)]"
              }`}
            >
              {label}
              {key === "legacy" && legacySummary.total > 0 && (
                <span className={`ml-1.5 rounded-full px-1.5 text-[10px] ${
                  activeTab === key ? "bg-amber-800/60 text-amber-300" : "bg-[var(--surface-chip)] text-amber-500"
                }`}>
                  {legacySummary.total}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* Section 1: Résultat réel                                          */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "real_result" && (
          <div className="space-y-3">
            <SectionHeader label={t("tab_real_result")} />

            {/* Revenus réels */}
            <Card>
              <div className="mb-2 flex items-center gap-2">
                <TrendingUp size={14} className="text-emerald-500" />
                <p className="text-sm font-semibold text-[var(--text-body)]">{t("income_section")}</p>
              </div>
              <ReportRow
                label={t("personal_income")}
                value={realResult.personalIncomeUSD}
                indent
                color="green"
              />
              <ReportRow
                label={t("business_income")}
                value={realResult.businessIncomeUSD}
                indent
                color="green"
              />
              <ReportRow
                label={t("profit_validated")}
                value={realResult.profitValidatedUSD}
                indent
                color="orange"
                note={t("profit_validated_note")}
              />
              <ReportRow
                label={t("total_real_income")}
                value={realResult.totalRealIncomeUSD}
                bold
                separator
                color="green"
              />
              {realResult.legacyIncludedUSD > 0 && (
                <p className="mt-1 text-[10px] text-[var(--text-faint)]">
                  ↳ {t("legacy_included_note")} : {formatMoney(realResult.legacyIncludedUSD, "USD")}
                </p>
              )}
            </Card>

            {/* Dépenses réelles */}
            <Card>
              <div className="mb-2 flex items-center gap-2">
                <TrendingDown size={14} className="text-red-500" />
                <p className="text-sm font-semibold text-[var(--text-body)]">{t("expense_section")}</p>
              </div>
              <ReportRow
                label={t("personal_expense")}
                value={-realResult.personalExpenseUSD}
                indent
                color="red"
              />
              <ReportRow
                label={t("business_expense")}
                value={-realResult.businessExpenseUSD}
                indent
                color="red"
              />
              <ReportRow
                label={t("total_real_expense")}
                value={-realResult.totalRealExpenseUSD}
                bold
                separator
                color="red"
              />
            </Card>

            {/* Net */}
            <Card className={realResult.netResultUSD >= 0 ? "border-emerald-800/30" : "border-red-800/30"}>
              <ReportRow
                label={t("net_result")}
                value={realResult.netResultUSD}
                bold
                color={realResult.netResultUSD >= 0 ? "green" : "red"}
              />
              <p className="mt-2 text-[10px] text-[var(--text-faint)]">{t("real_result_note")}</p>
            </Card>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* Section 2: Trésorerie                                             */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "treasury" && (
          <div className="space-y-3">
            <SectionHeader label={t("tab_treasury")} />
            <p className="text-xs text-[var(--text-label)]">{t("treasury_note")}</p>
            <Card>
              <ReportRow
                label={t("physical_inflow")}
                value={treasury.physicalInflowUSD}
                color="green"
                note={t("physical_inflow_note")}
              />
              <ReportRow
                label={t("physical_outflow")}
                value={-treasury.physicalOutflowUSD}
                color="red"
                note={t("physical_outflow_note")}
              />
              <ReportRow
                label={t("corrections")}
                value={treasury.correctionsNetUSD}
                color={treasury.correctionsNetUSD >= 0 ? "default" : "red"}
                note={t("corrections_note")}
                separator
              />
              <ReportRow
                label={t("net_flow")}
                value={treasury.netFlowUSD}
                bold
                separator
                color={treasury.netFlowUSD >= 0 ? "green" : "red"}
              />
            </Card>

            <Card className="border-sky-800/20 bg-sky-950/10">
              <p className="text-xs text-sky-400">{t("treasury_vs_result")}</p>
              <div className="mt-2 space-y-1">
                <div className="flex justify-between text-xs text-[var(--text-muted)]">
                  <span>{t("treasury_includes")}</span>
                  <span>{t("result_excludes")}</span>
                </div>
                <div className="flex gap-2 text-[11px]">
                  <div className="flex-1 rounded bg-[var(--surface-chip)] p-2 text-[var(--text-muted)]">
                    {t("treasury_includes_list")}
                  </div>
                  <div className="flex-1 rounded bg-[var(--surface-chip)] p-2 text-[var(--text-muted)]">
                    {t("result_excludes_list")}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* Section 3: Argent client                                          */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "client_money" && (
          <div className="space-y-3">
            <SectionHeader label={t("tab_client_money")} />
            <Card>
              <ReportRow
                label={t("client_received")}
                value={clientMoney.received}
                color="green"
              />
              <ReportRow
                label={t("client_product_cost")}
                value={-clientMoney.productCost}
                indent
                color="red"
              />
              <ReportRow
                label={t("client_fees")}
                value={-clientMoney.fees}
                indent
                color="red"
              />
              <ReportRow
                label={t("client_shared_fees")}
                value={-clientMoney.sharedFees}
                indent
                color="red"
              />
              <ReportRow
                label={t("client_refunds")}
                value={-clientMoney.refunds}
                indent
                color="red"
              />
              <ReportRow
                label={t("client_profit_validated")}
                value={-clientMoney.profit}
                indent
                color="orange"
                note={t("client_profit_note")}
                separator
              />
              <ReportRow
                label={t("client_balance")}
                value={clientMoney.balance}
                bold
                separator
                color={clientMoney.balance < 0 ? "red" : "default"}
              />
            </Card>
            {clientMoney.balance < 0 && (
              <Card className="border-red-800/30 bg-red-950/10">
                <div className="flex items-center gap-2">
                  <AlertCircle size={14} className="text-red-400" />
                  <p className="text-sm text-red-400">{t("client_deficit_warning")}</p>
                </div>
              </Card>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* Section 4: Par client                                             */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "per_client" && (
          <div className="space-y-3">
            <SectionHeader label={t("tab_per_client")} />
            <div className="relative">
              <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
              <input
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                placeholder={t("client_search")}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] py-2.5 pl-8 pr-3 text-sm text-[var(--text-strong)] placeholder:text-[var(--text-faint)] focus:border-[var(--brand)]/70 focus:outline-none"
              />
            </div>
            {clientReports.length === 0 ? (
              <EmptyState message={t("per_client_empty")} />
            ) : (
              <div className="space-y-2">
                {clientReports.map((r) => (
                  <Card key={r.clientId}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[var(--text-strong)]">{r.clientName}</p>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--text-label)]">
                          {r.receivedUSD > 0 && (
                            <span>Reçu : <AmountCell value={r.receivedUSD} /></span>
                          )}
                          {r.productCostUSD > 0 && (
                            <span>Achats : <AmountCell value={r.productCostUSD} /></span>
                          )}
                          {(r.shippingFeesUSD + r.sharedFeesUSD) > 0 && (
                            <span>Frais : <AmountCell value={r.shippingFeesUSD + r.sharedFeesUSD} /></span>
                          )}
                          {r.refundsUSD > 0 && (
                            <span>Remboursé : <AmountCell value={r.refundsUSD} /></span>
                          )}
                          {r.profitValidatedUSD > 0 && (
                            <span className="text-[var(--brand-text)]">Bénéfice : <AmountCell value={r.profitValidatedUSD} /></span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[10px] text-[var(--text-label)]">{t("col_balance")}</p>
                        <p className={`font-mono text-sm font-bold tabular-nums ${r.balanceUSD < 0 ? "text-red-400" : "text-[var(--text-strong)]"}`}>
                          {formatMoney(Math.abs(r.balanceUSD), "USD")}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* Section 5: Par commande                                           */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "per_order" && (
          <div className="space-y-3">
            <SectionHeader label={t("tab_per_order")} />
            <div className="relative">
              <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
              <input
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                placeholder={t("order_search")}
                className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] py-2.5 pl-8 pr-3 text-sm text-[var(--text-strong)] placeholder:text-[var(--text-faint)] focus:border-[var(--brand)]/70 focus:outline-none"
              />
            </div>
            {orderReports.length === 0 ? (
              <EmptyState message={t("per_order_empty")} />
            ) : (
              <div className="space-y-2">
                {orderReports.map((r) => (
                  <Card key={r.orderId}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-semibold text-[var(--text-strong)]">{r.productName}</p>
                          <Badge variant="default" className="text-[10px]">{r.status}</Badge>
                        </div>
                        <p className="mt-0.5 text-xs text-[var(--text-label)]">{r.clientName}</p>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[var(--text-label)]">
                          {r.receivedUSD > 0 && (
                            <span>Reçu : <AmountCell value={r.receivedUSD} /></span>
                          )}
                          {r.productCostUSD > 0 && (
                            <span>Achat : <AmountCell value={r.productCostUSD} /></span>
                          )}
                          {r.feesUSD > 0 && (
                            <span>Frais : <AmountCell value={r.feesUSD} /></span>
                          )}
                          {r.estimatedProfitUSD > 0 && (
                            <span>Estimé : <AmountCell value={r.estimatedProfitUSD} /></span>
                          )}
                          {r.profitValidatedUSD > 0 && (
                            <span className="text-[var(--brand-text)]">Validé : <AmountCell value={r.profitValidatedUSD} /></span>
                          )}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[10px] text-[var(--text-label)]">{t("balance_remaining")}</p>
                        <p className={`font-mono text-sm font-bold tabular-nums ${r.balanceRemainingUSD < 0 ? "text-red-400" : r.balanceRemainingUSD === 0 ? "text-[var(--text-label)]" : "text-[var(--text-strong)]"}`}>
                          {formatMoney(Math.abs(r.balanceRemainingUSD), "USD")}
                        </p>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* Section 6: Dettes & créances                                      */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "debts" && (
          <div className="space-y-4">
            {/* Dettes (je dois) */}
            <div>
              <SectionHeader label={t("debts_section")} />
              <div className="mb-2">
                <MetricCard
                  label={t("col_balance")}
                  value={debtSections.totalOwedUSD}
                  currency="USD"
                  color="red"
                  note={`${debtSections.myDebts.length} dette${debtSections.myDebts.length !== 1 ? "s" : ""} en cours`}
                />
              </div>
              {debtSections.myDebts.length === 0 ? (
                <EmptyState message={t("debt_empty")} />
              ) : (
                <div className="space-y-2">
                  {debtSections.myDebts.map((d) => {
                    const remaining = Number(d.amount) - Number(d.paid_amount);
                    const overdue = debtSections.isOverdue(d);
                    return (
                      <Card key={d.id}>
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm text-[var(--text-body)]">{d.person_name}</p>
                              {overdue && <Badge variant="danger">{t("overdue")}</Badge>}
                            </div>
                            <p className="text-xs text-[var(--text-label)]">
                              {d.due_date ? formatDate(d.due_date) : "—"}
                              {d.note ? ` · ${d.note}` : ""}
                            </p>
                          </div>
                          <p className="font-mono text-sm font-medium text-red-400">
                            {formatMoney(remaining, d.currency)}
                          </p>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Créances (on me doit) */}
            <div>
              <SectionHeader label={t("receivables_section")} />
              <div className="mb-2">
                <MetricCard
                  label={t("col_balance")}
                  value={debtSections.totalReceivableUSD}
                  currency="USD"
                  color="green"
                  note={`${debtSections.receivables.length} créance${debtSections.receivables.length !== 1 ? "s" : ""} en cours`}
                />
              </div>
              {debtSections.receivables.length === 0 ? (
                <EmptyState message={t("receivable_empty")} />
              ) : (
                <div className="space-y-2">
                  {debtSections.receivables.map((d) => {
                    const remaining = Number(d.amount) - Number(d.paid_amount);
                    const overdue = debtSections.isOverdue(d);
                    return (
                      <Card key={d.id}>
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="text-sm text-[var(--text-body)]">{d.person_name}</p>
                              {overdue && <Badge variant="warning">{t("overdue")}</Badge>}
                            </div>
                            <p className="text-xs text-[var(--text-label)]">
                              {d.due_date ? formatDate(d.due_date) : "—"}
                              {d.note ? ` · ${d.note}` : ""}
                            </p>
                          </div>
                          <p className="font-mono text-sm font-medium text-emerald-400">
                            {formatMoney(remaining, d.currency)}
                          </p>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════ */}
        {/* Section 7: Legacy                                                 */}
        {/* ══════════════════════════════════════════════════════════════════ */}
        {activeTab === "legacy" && (
          <div className="space-y-3">
            <SectionHeader label={t("tab_legacy")} />

            {legacySummary.total === 0 ? (
              <Card className="border-emerald-800/20">
                <p className="py-2 text-center text-sm text-emerald-400">
                  ✓ {t("legacy_all_classified")}
                </p>
              </Card>
            ) : (
              <>
                <Card className="border-amber-800/30 bg-amber-950/10">
                  <div className="flex items-center gap-2">
                    <AlertCircle size={14} className="text-amber-400" />
                    <p className="text-sm text-amber-300">{t("legacy_warning")}</p>
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-lg bg-[var(--surface-chip)]/60 p-2">
                      <p className="text-lg font-bold text-[var(--text-strong)]">{legacySummary.total}</p>
                      <p className="text-[10px] text-[var(--text-label)]">{t("legacy_count")}</p>
                    </div>
                    <div className="rounded-lg bg-[var(--surface-chip)]/60 p-2">
                      <p className="text-lg font-bold text-sky-400">{legacySummary.classifiedCount}</p>
                      <p className="text-[10px] text-[var(--text-label)]">{t("legacy_classified")}</p>
                    </div>
                    <div className="rounded-lg bg-red-950/40 p-2">
                      <p className="text-lg font-bold text-red-400">{legacySummary.unclassifiedCount}</p>
                      <p className="text-[10px] text-[var(--text-label)]">{t("legacy_unclassified")}</p>
                    </div>
                  </div>
                </Card>

                <Card>
                  <p className="mb-2 text-xs text-[var(--text-muted)]">{t("legacy_approx_title")}</p>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[var(--text-muted)]">{t("legacy_income_approx")}</span>
                      <span className="font-mono text-sm text-emerald-400">
                        {formatMoney(legacySummary.totalIncomeUSD, "USD")}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-[var(--text-muted)]">{t("legacy_expense_approx")}</span>
                      <span className="font-mono text-sm text-red-400">
                        {formatMoney(legacySummary.totalExpenseUSD, "USD")}
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 text-[10px] text-[var(--text-faint)]">{t("legacy_approx_note")}</p>
                </Card>

                {legacySummary.recent.length > 0 && (
                  <Card>
                    <p className="mb-2 text-xs font-medium text-[var(--text-muted)]">{t("legacy_recent")}</p>
                    <ul className="divide-y divide-[var(--border-default)]">
                      {legacySummary.recent.map((tx) => (
                        <li key={tx.id} className="flex items-center justify-between gap-4 py-2">
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm text-[var(--text-body)]">
                              {tx.category ?? tx.note ?? "—"}
                            </p>
                            <p className="text-xs text-[var(--text-faint)]">
                              {formatDate(tx.transaction_date)}
                              {tx.accounting_type ? ` · ${tx.accounting_type}` : " · non classée"}
                            </p>
                          </div>
                          <p className={`shrink-0 font-mono text-sm ${tx.type === "income" ? "text-emerald-400" : "text-red-400"}`}>
                            {tx.type === "income" ? "+" : "−"}
                            {formatMoney(tx.amount, tx.currency)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </Card>
                )}

                <Link
                  href={`/${locale}/transactions`}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--brand-fill)]/50 py-2.5 text-sm font-medium text-[var(--brand-text)] transition-colors hover:bg-[var(--indigo-950)]/20"
                >
                  <ExternalLink size={14} />
                  {t("legacy_action")}
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
