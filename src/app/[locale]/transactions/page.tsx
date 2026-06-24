"use client";

import { useState, useMemo, useCallback } from "react";
import { use } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useTransactions, CreateOperationInput } from "@/hooks/useTransactions";
import { useAccounts } from "@/hooks/useAccounts";
import { useClients } from "@/hooks/useClients";
import { useOrders } from "@/hooks/useOrders";
import { useDebts } from "@/hooks/useDebts";
import { useCurrencies } from "@/hooks/useCurrencies";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TransactionFormModal } from "@/components/transactions/TransactionFormModal";
import { AccountingType, TransactionType, TransactionSubType } from "@/lib/supabase/types";
import { SUB_TYPE_META } from "@/lib/transaction-types";
import { formatDate } from "@/lib/utils";
import { formatMoney, getValidRate, DEFAULT_CURRENCIES } from "@/lib/currency";
import { Plus, Scale, X, ChevronDown, Trash2, RefreshCw, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useReclassify } from "@/hooks/useReclassify";
import { SUB_TYPE_GROUPS } from "@/lib/transaction-types";

const PAGE_SIZE = 30;

const DEFAULT_RATE_MAP: Record<string, number> = Object.fromEntries(
  DEFAULT_CURRENCIES.map((c) => [c.code, c.rate_to_usd])
);

const ACCOUNTING_IMPACT: Record<AccountingType, { label: string; color: string }> = {
  real_income:           { label: "Compté comme revenu réel",            color: "text-emerald-400" },
  non_income_inflow:     { label: "Entrée non comptée comme revenu",     color: "text-sky-400" },
  real_expense:          { label: "Comptée comme dépense réelle",        color: "text-red-400" },
  non_expense_outflow:   { label: "Sortie non comptée comme dépense",    color: "text-[var(--tint-warning-fg)]" },
  adjustment:            { label: "Correction de solde uniquement",      color: "text-[var(--tint-warning-fg)]" },
};

const SUBTYPE_FILTER_GROUPS = [
  {
    label: "Client",
    items: [
      "client_money_received", "client_product_purchase", "client_shipping_fee",
      "shared_client_fee", "client_refund", "profit_validated",
    ] as TransactionSubType[],
  },
  {
    label: "Dette / Créance",
    items: [
      "debt_received", "debt_repayment", "receivable_created", "receivable_repaid",
    ] as TransactionSubType[],
  },
];

type Props = { params: Promise<{ locale: string }> };

export default function TransactionsPage({ params }: Props) {
  const { locale } = use(params);
  const t = useTranslations("transactions");
  const tc = useTranslations("common");

  const {
    transactions,
    loading: txLoading,
    createOperation,
    deleteTransaction,
    addAdjustment,
  } = useTransactions();
  const { reclassify, loading: reclassifying } = useReclassify();
  const { accounts, loading: accLoading } = useAccounts();
  const { clients } = useClients();
  const { orders } = useOrders();
  const { debts } = useDebts();
  const { ratesByCode } = useCurrencies();

  const [showNewForm, setShowNewForm]         = useState(false);
  const [showLegacyForm, setShowLegacyForm]   = useState(false);
  const [showTechStats, setShowTechStats]     = useState(false);
  const [showAll, setShowAll]                 = useState(false);
  const [openDropdown, setOpenDropdown]       = useState<"account" | "subtype" | null>(null);
  const [expandedId, setExpandedId]           = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget]       = useState<{
    id: string; accountId: string | null; type: TransactionType; amount: number;
  } | null>(null);
  const [deleteError, setDeleteError]         = useState<string | null>(null);
  const [showReclassify, setShowReclassify]   = useState(false);
  const [reclassifySubType, setReclassifySubType] = useState<TransactionSubType | "">("");

  // Filters
  const [filterType, setFilterType]         = useState<"" | "income" | "expense">("");
  const [filterAccount, setFilterAccount]   = useState("");
  const [filterSubType, setFilterSubType]   = useState<"" | TransactionSubType>("");

  // Reconciliation form
  const [adjAccountId, setAdjAccountId]         = useState("");
  const [adjTargetBalance, setAdjTargetBalance] = useState("");
  const [adjNote, setAdjNote]                   = useState("");
  const [adjDate, setAdjDate]                   = useState(new Date().toISOString().split("T")[0]);
  const [isSubmitting, setIsSubmitting]         = useState(false);
  const [adjError, setAdjError]                 = useState<string | null>(null);

  // ── Helpers ───────────────────────────────────────────────────────────────────

  const resolveRate = useCallback(
    (currency: string): number =>
      getValidRate(ratesByCode[currency]) ?? DEFAULT_RATE_MAP[currency] ?? 1,
    [ratesByCode]
  );

  // ── Derived ───────────────────────────────────────────────────────────────────

  const filtered = useMemo(
    () =>
      transactions.filter((tx) => {
        if (filterType && tx.type !== filterType) return false;
        if (filterAccount && tx.account_id !== filterAccount) return false;
        if (filterSubType && tx.sub_type !== filterSubType) return false;
        return true;
      }),
    [transactions, filterType, filterAccount, filterSubType]
  );

  const totals = useMemo(() => {
    let realIncome = 0, realExpense = 0, inflows = 0, outflows = 0, adjustments = 0;
    for (const tx of filtered) {
      const usd = Number(tx.amount) * resolveRate(tx.currency);
      const at = tx.accounting_type;
      if (at === "adjustment")               adjustments += tx.type === "income" ? usd : -usd;
      else if (at === "non_income_inflow")   inflows += usd;
      else if (at === "non_expense_outflow") outflows += usd;
      else if (at === "real_income"  || (!at && tx.type === "income"))  realIncome += usd;
      else if (at === "real_expense" || (!at && tx.type === "expense")) realExpense += usd;
    }
    return { realIncome, realExpense, inflows, outflows, adjustments, netReal: realIncome - realExpense };
  }, [filtered, resolveRate]);

  const visible = useMemo(
    () => (showAll ? filtered : filtered.slice(0, PAGE_SIZE)),
    [filtered, showAll]
  );

  const adjAccount = useMemo(
    () => accounts.find((a) => a.id === adjAccountId) ?? null,
    [accounts, adjAccountId]
  );

  const adjDifference = useMemo(() => {
    if (!adjAccount || adjTargetBalance === "") return null;
    return Number(adjTargetBalance) - Number(adjAccount.balance);
  }, [adjAccount, adjTargetBalance]);

  const detailTx = useMemo(
    () => transactions.find((t) => t.id === expandedId) ?? null,
    [transactions, expandedId]
  );

  // ── Actions ───────────────────────────────────────────────────────────────────

  async function handleCreateOperation(input: CreateOperationInput) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await createOperation(user.id, input);
  }

  async function handleSubmitAdjustment(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true);
    setAdjError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !adjAccountId || adjTargetBalance === "") return;
      const acc = accounts.find((a) => a.id === adjAccountId);
      await addAdjustment(user.id, adjAccountId, acc?.currency ?? "USD",
        Number(adjTargetBalance), adjNote || null, adjDate);
      setShowLegacyForm(false);
    } catch (err) {
      setAdjError(err instanceof Error ? err.message : "Erreur lors de la correction.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function openReconcile() {
    setAdjAccountId(accounts[0]?.id ?? "");
    setAdjTargetBalance(accounts[0] ? String(Number(accounts[0].balance).toFixed(2)) : "");
    setAdjNote("");
    setAdjDate(new Date().toISOString().split("T")[0]);
    setAdjError(null);
    setShowLegacyForm(true);
  }

  async function handleReclassify() {
    if (!expandedId || !reclassifySubType) return;
    const ok = await reclassify({ transactionId: expandedId, subType: reclassifySubType as TransactionSubType });
    if (ok) {
      setExpandedId(null);
      setShowReclassify(false);
      setReclassifySubType("");
    }
  }

  // ── Loading ───────────────────────────────────────────────────────────────────

  if (txLoading || accLoading) {
    return (
      <PageWrapper locale={locale}>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="h-7 w-32 animate-pulse rounded-lg bg-[var(--surface-chip)]" />
            <div className="h-9 w-44 animate-pulse rounded-lg bg-[var(--surface-chip)]" />
          </div>
          <SkeletonList count={5} />
        </div>
      </PageWrapper>
    );
  }

  // ── Derived labels for dropdowns ──────────────────────────────────────────────

  const activeAccountLabel = filterAccount
    ? (accounts.find((a) => a.id === filterAccount)?.name ?? t("filters.all_accounts"))
    : t("filters.all_accounts");
  const activeSubTypeLabel = filterSubType
    ? (SUB_TYPE_META[filterSubType]?.label ?? "Sous-type")
    : "Tous sous-types";

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <PageWrapper locale={locale}>
      <div className="space-y-4">

        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-[var(--text-strong)]">{t("title")}</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={openReconcile}
              aria-label="Réconcilier un solde"
              title="Réconcilier un solde"
              className="flex items-center gap-1.5 rounded-lg border border-[var(--border-strong)] px-2.5 py-2 text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-chip)] hover:text-[var(--text-body)]"
            >
              <Scale size={14} />
              <span className="hidden sm:inline">Réconcilier</span>
            </button>
            <button
              onClick={() => setShowNewForm(true)}
              aria-label={t("add")}
              className="flex items-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-500"
            >
              <Plus size={15} />
              <span className="hidden sm:inline">{t("add")}</span>
            </button>
          </div>
        </div>

        {/* ── Dropdown backdrop ── */}
        {openDropdown && (
          <div className="fixed inset-0 z-30" onClick={() => setOpenDropdown(null)} />
        )}

        {/* ── Filters ── */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Type pills */}
          {(["", "income", "expense"] as const).map((v) => (
            <button
              key={v}
              onClick={() => { setFilterType(v); setShowAll(false); }}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                filterType === v
                  ? "border-orange-600/60 bg-orange-950/40 text-orange-300"
                  : "border-[var(--border-strong)] text-[var(--text-label)] hover:border-[var(--border-strong)] hover:text-[var(--text-body)]"
              }`}
            >
              {v === "" ? t("filters.all_types") : v === "income" ? t("income") : t("expense")}
            </button>
          ))}

          <div className="h-4 w-px self-center bg-[var(--surface-chip)]" />

          {/* Account custom dropdown */}
          <div className="relative z-40">
            <button
              onClick={() => setOpenDropdown(openDropdown === "account" ? null : "account")}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                filterAccount
                  ? "border-orange-600/60 bg-orange-950/40 text-orange-300"
                  : "border-[var(--border-strong)] text-[var(--text-label)] hover:border-[var(--border-strong)] hover:text-[var(--text-body)]"
              }`}
            >
              <span className="max-w-[100px] truncate">{activeAccountLabel}</span>
              <ChevronDown
                size={10}
                className={`shrink-0 transition-transform ${openDropdown === "account" ? "rotate-180" : ""}`}
              />
            </button>
            {openDropdown === "account" && (
              <div className="absolute left-0 top-full z-40 mt-1.5 max-h-[55vh] min-w-[180px] overflow-y-auto rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] py-1 shadow-2xl">
                {[
                  { id: "", label: t("filters.all_accounts") },
                  ...accounts.map((a) => ({ id: a.id, label: a.name })),
                ].map((opt) => (
                  <button
                    key={opt.id}
                    onClick={() => { setFilterAccount(opt.id); setShowAll(false); setOpenDropdown(null); }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-[var(--surface-chip)] ${
                      filterAccount === opt.id ? "text-orange-300" : "text-[var(--text-body)]"
                    }`}
                  >
                    {filterAccount === opt.id && (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                    )}
                    <span className="truncate">{opt.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sub-type custom dropdown */}
          <div className="relative z-40">
            <button
              onClick={() => setOpenDropdown(openDropdown === "subtype" ? null : "subtype")}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                filterSubType
                  ? "border-orange-600/60 bg-orange-950/40 text-orange-300"
                  : "border-[var(--border-strong)] text-[var(--text-label)] hover:border-[var(--border-strong)] hover:text-[var(--text-body)]"
              }`}
            >
              <span className="max-w-[110px] truncate">{activeSubTypeLabel}</span>
              <ChevronDown
                size={10}
                className={`shrink-0 transition-transform ${openDropdown === "subtype" ? "rotate-180" : ""}`}
              />
            </button>
            {openDropdown === "subtype" && (
              <div className="absolute right-0 top-full z-40 mt-1.5 max-h-[55vh] w-56 overflow-y-auto rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] py-1 shadow-2xl">
                <button
                  onClick={() => { setFilterSubType(""); setShowAll(false); setOpenDropdown(null); }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-[var(--surface-chip)] ${
                    !filterSubType ? "text-orange-300" : "text-[var(--text-body)]"
                  }`}
                >
                  {!filterSubType && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />}
                  Tous sous-types
                </button>
                {SUBTYPE_FILTER_GROUPS.map((group) => (
                  <div key={group.label}>
                    <p className="px-3 pb-0.5 pt-2 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
                      {group.label}
                    </p>
                    {group.items.map((st) => (
                      <button
                        key={st}
                        onClick={() => { setFilterSubType(st); setShowAll(false); setOpenDropdown(null); }}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-[var(--surface-chip)] ${
                          filterSubType === st ? "text-orange-300" : "text-[var(--text-muted)]"
                        }`}
                      >
                        {filterSubType === st && (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                        )}
                        <span className="truncate">{SUB_TYPE_META[st].label}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Summary ── */}
        {filtered.length > 0 && (
          <Card>
            <div className="space-y-2.5 sm:grid sm:grid-cols-3 sm:gap-4 sm:space-y-0">
              <div className="flex items-center justify-between sm:block">
                <p className="text-[10px] text-[var(--text-label)] sm:text-xs">Revenu réel</p>
                <p className="font-mono text-sm font-bold tabular-nums text-emerald-400 sm:mt-0.5 sm:leading-tight">
                  +{formatMoney(totals.realIncome, "USD")}
                </p>
              </div>
              <div className="flex items-center justify-between sm:block">
                <p className="text-[10px] text-[var(--text-label)] sm:text-xs">Dépense réelle</p>
                <p className="font-mono text-sm font-bold tabular-nums text-red-400 sm:mt-0.5 sm:leading-tight">
                  -{formatMoney(totals.realExpense, "USD")}
                </p>
              </div>
              <div className="flex items-center justify-between sm:block">
                <p className="text-[10px] text-[var(--text-label)] sm:text-xs">Net réel</p>
                <p className={`font-mono text-sm font-bold tabular-nums sm:mt-0.5 sm:leading-tight ${
                  totals.netReal >= 0 ? "text-[var(--text-strong)]" : "text-red-400"
                }`}>
                  {totals.netReal >= 0 ? "+" : ""}{formatMoney(Math.abs(totals.netReal), "USD")}
                </p>
              </div>
            </div>
            {(totals.inflows > 0 || totals.outflows > 0 || totals.adjustments !== 0) && (
              <>
                <button
                  onClick={() => setShowTechStats((s) => !s)}
                  className="mt-2.5 text-[10px] text-[var(--text-faint)] transition-colors hover:text-[var(--text-muted)]"
                >
                  {showTechStats ? "▴ Masquer détails" : "▾ Détails techniques"}
                </button>
                {showTechStats && (
                  <div className="mt-2 grid grid-cols-3 gap-2 border-t border-[var(--border-subtle)] pt-2">
                    {totals.inflows > 0 && (
                      <div>
                        <p className="text-[10px] text-[var(--text-faint)]">Entrées non-revenu</p>
                        <p className="font-mono text-xs tabular-nums text-[var(--text-muted)]">+{formatMoney(totals.inflows, "USD")}</p>
                      </div>
                    )}
                    {totals.outflows > 0 && (
                      <div>
                        <p className="text-[10px] text-[var(--text-faint)]">Sorties temp.</p>
                        <p className="font-mono text-xs tabular-nums text-[var(--text-muted)]">-{formatMoney(totals.outflows, "USD")}</p>
                      </div>
                    )}
                    {totals.adjustments !== 0 && (
                      <div>
                        <p className="text-[10px] text-[var(--text-faint)]">Corrections</p>
                        <p className="font-mono text-xs tabular-nums text-[var(--tint-warning-fg)]">
                          {totals.adjustments >= 0 ? "+" : ""}{formatMoney(Math.abs(totals.adjustments), "USD")}
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </Card>
        )}

        {/* ── Transaction list ── */}
        {filtered.length > 0 && (
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
            {filtered.length} transaction{filtered.length > 1 ? "s" : ""}
          </p>
        )}
        {filtered.length === 0 ? (
          <EmptyState message={tc("empty")} />
        ) : (
          <Card className="overflow-hidden p-0">
            <ul className="divide-y divide-[var(--border-subtle)]">
              {visible.map((tx) => {
                const acc       = accounts.find((a) => a.id === tx.account_id);
                const client    = tx.client_id ? clients.find((c) => c.id === tx.client_id) : null;
                const isAdj     = tx.accounting_type === "adjustment";
                const subLabel  = tx.sub_type ? SUB_TYPE_META[tx.sub_type]?.label : null;
                const dotColor  = isAdj ? "bg-orange-600" : tx.type === "expense" ? "bg-red-500/70" : "bg-emerald-500/70";
                const amtColor  = isAdj ? "text-[var(--tint-warning-fg)]" : tx.type === "expense" ? "text-red-400" : "text-emerald-400";
                const amtPrefix = isAdj ? "" : tx.type === "expense" ? "−" : "+";

                const isExpanded = expandedId === tx.id;
                return (
                  <li key={tx.id}>
                    <button
                      className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-chip)]/25"
                      onClick={() => setExpandedId(isExpanded ? null : tx.id)}
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${dotColor}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-1.5">
                          <p className="min-w-0 truncate text-sm text-[var(--text-body)]">
                            {tx.category ?? tx.note ?? subLabel ?? "—"}
                          </p>
                          {tx.sub_type === null && (
                            <span className="shrink-0 rounded-full bg-[var(--surface-chip)]/60 px-1.5 py-0.5 text-[9px] text-[var(--text-faint)]">legacy</span>
                          )}
                          {subLabel && (tx.accounting_type === "non_income_inflow" || tx.accounting_type === "non_expense_outflow") && (
                            <span className="shrink-0 rounded-full bg-[var(--surface-chip)] px-1.5 py-0.5 text-[9px] text-[var(--text-label)]">{subLabel}</span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-[var(--text-faint)]">
                          {acc?.name ?? "—"}{" · "}{formatDate(tx.transaction_date)}{client && ` · ${client.name}`}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className={`font-mono text-sm font-semibold tabular-nums ${amtColor}`}>
                          {amtPrefix}{formatMoney(tx.amount, tx.currency)}
                        </p>
                        <p className="text-[10px] text-[var(--text-faint)]">{tx.currency}</p>
                      </div>
                    </button>

                    {/* Inline expansion — replaces the drawer */}
                    {isExpanded && (() => {
                      const detailAcc = acc;
                      const detailClient = client;
                      const detailOrder = tx.order_id ? orders.find((o) => o.id === tx.order_id) : null;
                      const detailSubMeta = tx.sub_type ? SUB_TYPE_META[tx.sub_type] : null;
                      const detailImpact = tx.accounting_type ? ACCOUNTING_IMPACT[tx.accounting_type] : null;
                      const detailIsAdj = tx.accounting_type === "adjustment";
                      return (
                        <div className="border-t border-[var(--border-default)] bg-[var(--surface-card)]/50 px-4 py-3 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-[var(--text-muted)]">{detailIsAdj ? "Correction" : tx.type === "expense" ? "Dépense" : "Revenu"}</span>
                            <button onClick={() => setExpandedId(null)} className="rounded-lg p-1 text-[var(--text-label)] hover:text-[var(--text-body)]"><X size={14} /></button>
                          </div>
                          <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-glass)] divide-y divide-[var(--border-subtle)]">
                            {(tx.category || tx.note) && (
                              <div className="flex items-start justify-between gap-3 px-3.5 py-2.5">
                                <p className="shrink-0 text-[11px] text-[var(--text-label)]">Description</p>
                                <p className="text-right text-xs text-[var(--text-body)]">{tx.category ?? tx.note}</p>
                              </div>
                            )}
                            {detailAcc && (
                              <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                                <p className="text-[11px] text-[var(--text-label)]">Compte</p>
                                <p className="text-xs text-[var(--text-body)]">{detailAcc.name}</p>
                              </div>
                            )}
                            {detailSubMeta ? (
                              <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                                <p className="text-[11px] text-[var(--text-label)]">Sous-type</p>
                                <span className="rounded-full bg-[var(--surface-chip)] px-2 py-0.5 text-[10px] text-[var(--text-body)]">{detailSubMeta.label}</span>
                              </div>
                            ) : (
                              <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                                <p className="text-[11px] text-[var(--text-label)]">Sous-type</p>
                                <span className="rounded-full bg-[var(--surface-chip)] px-2 py-0.5 text-[10px] text-[var(--text-faint)]">legacy</span>
                              </div>
                            )}
                            {detailClient && (
                              <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                                <p className="text-[11px] text-[var(--text-label)]">Client</p>
                                <p className="text-xs text-[var(--text-body)]">{detailClient.name}</p>
                              </div>
                            )}
                            {detailOrder && (
                              <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                                <p className="text-[11px] text-[var(--text-label)]">Commande</p>
                                <p className="text-xs text-[var(--text-body)]">{detailOrder.product_name}</p>
                              </div>
                            )}
                            {detailImpact && (
                              <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                                <p className="text-[11px] text-[var(--text-label)]">Impact</p>
                                <p className={`text-right text-xs ${detailImpact.color}`}>{detailImpact.label}</p>
                              </div>
                            )}
                            {tx.balance_after !== null && (
                              <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
                                <p className="text-[11px] text-[var(--text-label)]">Solde après</p>
                                <p className="font-mono text-xs tabular-nums text-[var(--text-body)]">{formatMoney(tx.balance_after, tx.currency)}</p>
                              </div>
                            )}
                          </div>
                          {tx.sub_type === null && (
                            <button
                              onClick={() => { setReclassifySubType(""); setShowReclassify(true); }}
                              className="flex w-full items-center justify-center gap-1.5 py-2 text-xs text-[var(--text-label)] transition-colors hover:text-[var(--text-body)]"
                            >
                              <RefreshCw size={11} /> Reclasser cette transaction
                            </button>
                          )}
                          <div className="flex gap-2">
                            {detailClient && (
                              <Link href={`/fr/clients`} className="flex items-center gap-1 rounded-lg border border-[var(--border-default)] px-2.5 py-1.5 text-[10px] text-[var(--text-label)] hover:border-[var(--border-strong)] hover:text-[var(--text-body)]"><ExternalLink size={10} />Voir le client</Link>
                            )}
                            {detailOrder && (
                              <Link href={`/fr/orders`} className="flex items-center gap-1 rounded-lg border border-[var(--border-default)] px-2.5 py-1.5 text-[10px] text-[var(--text-label)] hover:border-[var(--border-strong)] hover:text-[var(--text-body)]"><ExternalLink size={10} />Voir la commande</Link>
                            )}
                          </div>
                          <button
                            onClick={() => {
                              setExpandedId(null);
                              setDeleteTarget({ id: tx.id, accountId: tx.account_id, type: tx.type, amount: tx.amount });
                            }}
                            className="flex w-full items-center justify-center gap-1.5 py-2 text-xs text-red-500/60 transition-colors hover:text-red-400"
                          >
                            <Trash2 size={11} /> Supprimer
                          </button>
                        </div>
                      );
                    })()}
                  </li>
                );
              })}
            </ul>

            {filtered.length > PAGE_SIZE && !showAll && (
              <button
                onClick={() => setShowAll(true)}
                className="w-full border-t border-[var(--border-subtle)] py-2.5 text-xs text-[var(--text-label)] transition-colors hover:bg-[var(--surface-chip)] hover:text-[var(--text-body)]"
              >
                Voir tout ({filtered.length} transactions)
              </button>
            )}
            {showAll && filtered.length > PAGE_SIZE && (
              <button
                onClick={() => setShowAll(false)}
                className="w-full border-t border-[var(--border-subtle)] py-2.5 text-xs text-[var(--text-label)] transition-colors hover:bg-[var(--surface-chip)] hover:text-[var(--text-body)]"
              >
                Réduire
              </button>
            )}
          </Card>
        )}
      </div>


      {/* ── New operation modal ─────────────────────────────────────────────────── */}
      <TransactionFormModal
        open={showNewForm}
        accounts={accounts}
        clients={clients}
        orders={orders}
        debts={debts}
        onClose={() => setShowNewForm(false)}
        onSubmit={handleCreateOperation}
      />

      {/* ── Reconciliation modal ────────────────────────────────────────────────── */}
      {showLegacyForm && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm md:items-center md:p-4"
          onClick={() => setShowLegacyForm(false)}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-md flex-col rounded-t-2xl border border-[var(--border-default)] bg-[var(--bg-app)] shadow-2xl md:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-2.5 md:hidden">
              <div className="h-1 w-10 rounded-full bg-[var(--border-strong)]" />
            </div>

            {/* Header */}
            <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
              <div>
                <h2 className="text-base font-bold text-[var(--text-strong)]">Réconciliation de solde</h2>
                <p className="mt-0.5 text-xs text-[var(--text-label)]">
                  Aligne l'app sur ton solde réel. Non compté comme revenu.
                </p>
              </div>
              <button
                onClick={() => setShowLegacyForm(false)}
                className="shrink-0 rounded-lg p-1.5 text-[var(--text-label)] transition-colors hover:bg-[var(--surface-chip)] hover:text-[var(--text-body)]"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmitAdjustment} className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto px-5 pb-2">
                <div className="space-y-4 py-1">

                  {/* Account */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Compte</label>
                    <select
                      value={adjAccountId}
                      onChange={(e) => {
                        setAdjAccountId(e.target.value);
                        const acc = accounts.find((a) => a.id === e.target.value);
                        if (acc) setAdjTargetBalance(String(Number(acc.balance).toFixed(2)));
                      }}
                      required
                      className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-3.5 py-2.5 text-sm text-[var(--text-strong)] focus:border-orange-500/70 focus:outline-none"
                    >
                      <option value="">—</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.currency})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Preview */}
                  {adjAccount && (
                    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-glass)] p-3.5">
                      <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
                        Aperçu
                      </p>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-[var(--text-label)]">Solde actuel (app)</p>
                          <p className="font-mono text-sm font-medium text-[var(--text-body)] tabular-nums">
                            {formatMoney(adjAccount.balance, adjAccount.currency)}
                          </p>
                        </div>
                        <div className="flex items-center justify-between">
                          <p className="text-xs text-[var(--text-label)]">Solde réel observé</p>
                          <p className={`font-mono text-sm font-medium tabular-nums ${
                            adjTargetBalance ? "text-[var(--text-body)]" : "text-[var(--text-faint)]"
                          }`}>
                            {adjTargetBalance
                              ? formatMoney(Number(adjTargetBalance), adjAccount.currency)
                              : "—"}
                          </p>
                        </div>
                        <div className="flex items-center justify-between border-t border-[var(--border-default)]/80 pt-2">
                          <p className="text-xs font-medium text-[var(--text-muted)]">Correction créée</p>
                          {adjDifference === null || adjTargetBalance === "" ? (
                            <p className="text-xs text-[var(--text-faint)]">—</p>
                          ) : Math.abs(adjDifference) < 0.001 ? (
                            <p className="text-xs text-[var(--text-label)]">Aucune correction</p>
                          ) : (
                            <p className={`font-mono text-sm font-bold tabular-nums ${
                              adjDifference > 0 ? "text-emerald-400" : "text-red-400"
                            }`}>
                              {adjDifference > 0 ? "+" : ""}{formatMoney(adjDifference, adjAccount.currency)}
                            </p>
                          )}
                        </div>
                        {adjDifference !== null && Math.abs(adjDifference) < 0.001 && adjTargetBalance !== "" && (
                          <p className="text-[11px] text-[var(--tint-warning-fg)]/80">
                            Aucune correction nécessaire — le solde est déjà correct.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Target balance */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
                      Solde réel observé
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={adjTargetBalance}
                      onChange={(e) => setAdjTargetBalance(e.target.value)}
                      required
                      className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-3.5 py-2.5 font-mono text-sm tabular-nums text-[var(--text-strong)] focus:border-orange-500/70 focus:outline-none focus:ring-1 focus:ring-orange-500/20"
                    />
                  </div>

                  {/* Date */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">Date</label>
                    <input
                      type="date"
                      value={adjDate}
                      onChange={(e) => setAdjDate(e.target.value)}
                      required
                      className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-3.5 py-2.5 text-sm text-[var(--text-strong)] focus:border-orange-500/70 focus:outline-none"
                    />
                  </div>

                  {/* Note */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[var(--text-muted)]">
                      Note (optionnel)
                    </label>
                    <input
                      value={adjNote}
                      onChange={(e) => setAdjNote(e.target.value)}
                      placeholder="Ex : Vérification Alipay"
                      className="w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-card)] px-3.5 py-2.5 text-sm text-[var(--text-strong)] placeholder:text-[var(--text-faint)] focus:border-orange-500/70 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div
                className="shrink-0 border-t border-[var(--border-default)] px-5 pt-3"
                style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
              >
                {adjError && (
                  <p className="mb-2.5 rounded-xl border border-red-900/50 bg-red-950/30 px-3.5 py-2.5 text-center text-xs text-red-400">
                    {adjError}
                  </p>
                )}
                {!adjError && adjDifference !== null && adjTargetBalance !== "" && (
                  <p className={`mb-2.5 text-center text-xs ${
                    Math.abs(adjDifference) < 0.001
                      ? "text-[var(--text-label)]"
                      : adjDifference > 0 ? "text-emerald-400" : "text-red-400"
                  }`}>
                    {Math.abs(adjDifference) < 0.001
                      ? "Aucune correction nécessaire"
                      : `Correction : ${adjDifference > 0 ? "+" : ""}${adjAccount ? formatMoney(adjDifference, adjAccount.currency) : adjDifference.toFixed(2)}`}
                  </p>
                )}
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowLegacyForm(false)}
                    className="flex-1 rounded-xl border border-[var(--border-strong)] py-2.5 text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--surface-chip)] hover:text-[var(--text-body)]"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={
                      isSubmitting ||
                      !adjAccountId ||
                      adjTargetBalance === "" ||
                      (adjDifference !== null && Math.abs(adjDifference) < 0.001)
                    }
                    className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors bg-orange-600 text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:bg-[var(--surface-chip)] disabled:text-[var(--text-label)]"
                  >
                    {isSubmitting ? "Application…" : "Appliquer"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Confirm delete ──────────────────────────────────────────────────────── */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Supprimer cette transaction ?"
        message={
          deleteError
            ? `Erreur : ${deleteError}`
            : deleteTarget?.accountId
            ? "Cette action est irréversible. Le solde du compte sera recalculé automatiquement."
            : "Cette action est irréversible."
        }
        confirmLabel={tc("delete")}
        cancelLabel={tc("cancel")}
        danger
        onConfirm={async () => {
          if (!deleteTarget) return;
          try {
            await deleteTransaction(
              deleteTarget.id,
              deleteTarget.accountId,
              deleteTarget.type,
              deleteTarget.amount
            );
            setDeleteTarget(null);
            setDeleteError(null);
          } catch (err: unknown) {
            setDeleteError(err instanceof Error ? err.message : "Échec de la suppression.");
          }
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </PageWrapper>
  );
}
