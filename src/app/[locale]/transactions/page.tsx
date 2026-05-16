"use client";

import { useState, useMemo, useCallback } from "react";
import { use } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useTransactions } from "@/hooks/useTransactions";
import { useAccounts } from "@/hooks/useAccounts";
import { useCurrencies } from "@/hooks/useCurrencies";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Card } from "@/components/ui/Card";
import { MoneyAmount } from "@/components/ui/MoneyAmount";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { AccountingType, TransactionType } from "@/lib/supabase/types";
import { formatDate } from "@/lib/utils";
import { formatMoney, getValidRate, DEFAULT_CURRENCIES } from "@/lib/currency";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  CATEGORY_ACCOUNTING_TYPE,
} from "@/lib/categories";
import { Plus, Trash2, Scale } from "lucide-react";

const PAGE_SIZE = 20;

const DEFAULT_RATE_MAP: Record<string, number> = Object.fromEntries(
  DEFAULT_CURRENCIES.map((c) => [c.code, c.rate_to_usd])
);

// Labels for accounting_type badge
const ACCOUNTING_LABELS: Record<AccountingType, string> = {
  real_income: "Revenu réel",
  non_income_inflow: "Entrée non-revenu",
  real_expense: "Dépense réelle",
  non_expense_outflow: "Sortie temporaire",
  adjustment: "Correction",
};

type Props = { params: Promise<{ locale: string }> };

// ── Modal type ────────────────────────────────────────────────────────────────

type FormMode = "transaction" | "adjustment";

export default function TransactionsPage({ params }: Props) {
  const { locale } = use(params);
  const t = useTranslations("transactions");
  const tc = useTranslations("common");
  const {
    transactions,
    loading: txLoading,
    addTransaction,
    deleteTransaction,
    addAdjustment,
  } = useTransactions();
  const { accounts, loading: accLoading } = useAccounts();
  const { ratesByCode } = useCurrencies();

  // ── Modal state ──────────────────────────────────────────────────────────────
  const [formMode, setFormMode] = useState<FormMode>("transaction");
  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    accountId: string;
    type: TransactionType;
    amount: number;
  } | null>(null);
  const [showAll, setShowAll] = useState(false);

  // ── Filters ──────────────────────────────────────────────────────────────────
  const [filterType, setFilterType] = useState<"" | "income" | "expense">("");
  const [filterAccount, setFilterAccount] = useState("");
  const [excludeAdjustments, setExcludeAdjustments] = useState(true);

  // ── Transaction form state ───────────────────────────────────────────────────
  const [txType, setTxType] = useState<TransactionType>("expense");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);

  // ── Adjustment form state ────────────────────────────────────────────────────
  const [adjAccountId, setAdjAccountId] = useState("");
  const [adjTargetBalance, setAdjTargetBalance] = useState("");
  const [adjNote, setAdjNote] = useState("");
  const [adjDate, setAdjDate] = useState(new Date().toISOString().split("T")[0]);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const resolveRate = useCallback(
    (currency: string): number =>
      getValidRate(ratesByCode[currency]) ?? DEFAULT_RATE_MAP[currency] ?? 1,
    [ratesByCode]
  );

  const formCategories = txType === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  // Auto-suggest accounting_type from category (used on submit, not stored in state)
  function accountingTypeForCategory(cat: string): AccountingType | null {
    return CATEGORY_ACCOUNTING_TYPE[cat] ?? null;
  }

  // ── Filtered transactions ────────────────────────────────────────────────────

  const filtered = useMemo(
    () =>
      transactions.filter((tx) => {
        if (filterType && tx.type !== filterType) return false;
        if (filterAccount && tx.account_id !== filterAccount) return false;
        return true;
      }),
    [transactions, filterType, filterAccount]
  );

  // ── Totals (respects excludeAdjustments toggle) ──────────────────────────────

  const totals = useMemo(() => {
    let realIncome = 0;
    let realExpense = 0;
    let inflows = 0; // non-revenue inflows
    let outflows = 0; // non-expense outflows
    let adjustments = 0;

    for (const tx of filtered) {
      const usd = Number(tx.amount) * resolveRate(tx.currency);
      const at = tx.accounting_type;

      if (at === "adjustment") {
        adjustments += tx.type === "income" ? usd : -usd;
      } else if (at === "non_income_inflow") {
        inflows += usd;
      } else if (at === "non_expense_outflow") {
        outflows += usd;
      } else if (at === "real_income" || (!at && tx.type === "income")) {
        realIncome += usd;
      } else if (at === "real_expense" || (!at && tx.type === "expense")) {
        realExpense += usd;
      }
    }

    const netReal = realIncome - realExpense;
    const netAll = realIncome + inflows - realExpense - outflows + adjustments;

    return { realIncome, realExpense, inflows, outflows, adjustments, netReal, netAll };
  }, [filtered, resolveRate]);

  const visible = useMemo(
    () => (showAll ? filtered : filtered.slice(0, PAGE_SIZE)),
    [filtered, showAll]
  );

  // ── Adjustment preview ───────────────────────────────────────────────────────

  const adjAccount = useMemo(
    () => accounts.find((a) => a.id === adjAccountId) ?? null,
    [accounts, adjAccountId]
  );

  const adjDifference = useMemo(() => {
    if (!adjAccount || adjTargetBalance === "") return null;
    const target = Number(adjTargetBalance);
    return target - Number(adjAccount.balance);
  }, [adjAccount, adjTargetBalance]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  function openTransactionForm() {
    setFormMode("transaction");
    setAccountId(accounts[0]?.id ?? "");
    setTxType("expense");
    setCategory("");
    setAmount("");
    setNote("");
    setDate(new Date().toISOString().split("T")[0]);
    setShowForm(true);
  }

  function openAdjustmentForm() {
    setFormMode("adjustment");
    setAdjAccountId(accounts[0]?.id ?? "");
    setAdjTargetBalance(
      accounts[0] ? String(Number(accounts[0].balance).toFixed(2)) : ""
    );
    setAdjNote("");
    setAdjDate(new Date().toISOString().split("T")[0]);
    setShowForm(true);
  }

  async function handleSubmitTransaction(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !accountId) return;
    const acc = accounts.find((a) => a.id === accountId);
    const accountingType = accountingTypeForCategory(category);
    await addTransaction(
      user.id,
      accountId,
      txType,
      Number(amount),
      acc?.currency ?? "USD",
      category || null,
      note || null,
      date,
      accountingType
    );
    setShowForm(false);
    setAmount("");
    setNote("");
    setCategory("");
  }

  async function handleSubmitAdjustment(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !adjAccountId || adjTargetBalance === "") return;
    const acc = accounts.find((a) => a.id === adjAccountId);
    await addAdjustment(
      user.id,
      adjAccountId,
      acc?.currency ?? "USD",
      Number(adjTargetBalance),
      adjNote || null,
      adjDate
    );
    setShowForm(false);
    setAdjTargetBalance("");
    setAdjNote("");
  }

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (txLoading || accLoading) {
    return (
      <PageWrapper locale={locale}>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="h-7 w-32 animate-pulse rounded-lg bg-slate-800" />
            <div className="h-9 w-44 animate-pulse rounded-lg bg-slate-800" />
          </div>
          <SkeletonList count={5} />
        </div>
      </PageWrapper>
    );
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <PageWrapper locale={locale}>
      <div className="space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-bold text-slate-50">{t("title")}</h1>
          <div className="flex gap-2">
            <button
              onClick={openAdjustmentForm}
              title="Réconcilier un solde"
              className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            >
              <Scale size={14} />
              <span className="hidden sm:inline">Réconcilier</span>
            </button>
            <button
              onClick={openTransactionForm}
              className="flex items-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700"
            >
              <Plus size={15} />
              {t("add")}
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <select
            value={filterType}
            onChange={(e) => {
              setFilterType(e.target.value as "" | "income" | "expense");
              setShowAll(false);
            }}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 focus:border-orange-500 focus:outline-none"
          >
            <option value="">{t("filters.all_types")}</option>
            <option value="income">{t("income")}</option>
            <option value="expense">{t("expense")}</option>
          </select>
          <select
            value={filterAccount}
            onChange={(e) => {
              setFilterAccount(e.target.value);
              setShowAll(false);
            }}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 focus:border-orange-500 focus:outline-none"
          >
            <option value="">{t("filters.all_accounts")}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        {/* Statistics */}
        {filtered.length > 0 && (
          <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <p className="text-xs text-slate-500">Revenu réel</p>
                <p className="font-mono text-sm font-semibold text-emerald-400 tabular-nums">
                  +{formatMoney(totals.realIncome, "USD")}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Dépense réelle</p>
                <p className="font-mono text-sm font-semibold text-red-400 tabular-nums">
                  -{formatMoney(totals.realExpense, "USD")}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Net réel</p>
                <p
                  className={`font-mono text-sm font-semibold tabular-nums ${
                    totals.netReal >= 0 ? "text-slate-100" : "text-red-400"
                  }`}
                >
                  {totals.netReal >= 0 ? "+" : ""}
                  {formatMoney(Math.abs(totals.netReal), "USD")}
                </p>
              </div>
            </div>
            {/* Secondary stats — only show if there's something non-trivial */}
            {(totals.inflows > 0 || totals.outflows > 0 || totals.adjustments !== 0) && (
              <div className="grid grid-cols-3 gap-2 border-t border-slate-800 pt-2">
                {totals.inflows > 0 && (
                  <div>
                    <p className="text-xs text-slate-600">Entrées non-revenu</p>
                    <p className="font-mono text-xs text-slate-400 tabular-nums">
                      +{formatMoney(totals.inflows, "USD")}
                    </p>
                  </div>
                )}
                {totals.outflows > 0 && (
                  <div>
                    <p className="text-xs text-slate-600">Sorties temp.</p>
                    <p className="font-mono text-xs text-slate-400 tabular-nums">
                      -{formatMoney(totals.outflows, "USD")}
                    </p>
                  </div>
                )}
                {totals.adjustments !== 0 && (
                  <div>
                    <p className="text-xs text-slate-600">Corrections</p>
                    <p className="font-mono text-xs text-amber-500 tabular-nums">
                      {totals.adjustments >= 0 ? "+" : ""}
                      {formatMoney(Math.abs(totals.adjustments), "USD")}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Transaction list */}
        {filtered.length === 0 ? (
          <EmptyState message={tc("empty")} />
        ) : (
          <div className="space-y-2">
            {visible.map((tx) => {
              const acc = accounts.find((a) => a.id === tx.account_id);
              const isAdjustment = tx.accounting_type === "adjustment";
              const isNonStandard =
                tx.accounting_type === "non_income_inflow" ||
                tx.accounting_type === "non_expense_outflow";

              return (
                <Card key={tx.id}>
                  <article className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant={
                            isAdjustment
                              ? "default"
                              : tx.type === "income"
                              ? "success"
                              : "danger"
                          }
                        >
                          {isAdjustment
                            ? "Correction"
                            : tx.type === "income"
                            ? t("income")
                            : t("expense")}
                        </Badge>
                        {isNonStandard && tx.accounting_type && (
                          <span className="rounded-full bg-amber-900/40 px-1.5 py-0.5 text-[10px] text-amber-400">
                            {ACCOUNTING_LABELS[tx.accounting_type]}
                          </span>
                        )}
                        {tx.category && (
                          <span className="truncate text-sm text-slate-300">
                            {tx.category}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {acc?.name ?? "—"} · {formatDate(tx.transaction_date)}
                      </p>
                      {tx.note && (
                        <p className="mt-0.5 truncate text-xs text-slate-600">
                          {tx.note}
                        </p>
                      )}
                      {/* Balance after transaction */}
                      {tx.balance_after !== null && tx.balance_after !== undefined && (
                        <p className="mt-1 text-xs text-slate-600">
                          Solde après :{" "}
                          <span className="font-mono tabular-nums text-slate-400">
                            {formatMoney(tx.balance_after, acc?.currency ?? tx.currency)}
                          </span>
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <MoneyAmount
                        amount={tx.amount}
                        currency={tx.currency}
                        className={`text-sm font-semibold tabular-nums ${
                          isAdjustment
                            ? "text-amber-400"
                            : tx.type === "expense"
                            ? "text-red-400"
                            : "text-emerald-400"
                        }`}
                      />
                      <button
                        onClick={() =>
                          setDeleteTarget({
                            id: tx.id,
                            accountId: tx.account_id,
                            type: tx.type,
                            amount: tx.amount,
                          })
                        }
                        className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-800 hover:text-red-400"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </article>
                </Card>
              );
            })}

            {filtered.length > PAGE_SIZE && !showAll && (
              <button
                onClick={() => setShowAll(true)}
                className="w-full rounded-lg border border-slate-700 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              >
                Voir tout ({filtered.length} transactions)
              </button>
            )}
            {showAll && filtered.length > PAGE_SIZE && (
              <button
                onClick={() => setShowAll(false)}
                className="w-full rounded-lg border border-slate-700 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              >
                Réduire
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Modal: Add transaction ── */}
      {showForm && formMode === "transaction" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-base font-semibold text-slate-50">{t("add")}</h2>
            <form onSubmit={handleSubmitTransaction} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t("type")}</label>
                <div className="flex gap-2">
                  {(["expense", "income"] as TransactionType[]).map((tp) => (
                    <button
                      key={tp}
                      type="button"
                      onClick={() => {
                        setTxType(tp);
                        setCategory("");
                      }}
                      className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                        txType === tp
                          ? tp === "income"
                            ? "bg-emerald-700 text-white"
                            : "bg-red-700 text-white"
                          : "border border-slate-700 text-slate-400 hover:bg-slate-800"
                      }`}
                    >
                      {tp === "income" ? t("income") : t("expense")}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  {t("account")}
                </label>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none"
                >
                  <option value="">—</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.currency})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  {t("amount")}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  {t("category")}
                </label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none"
                >
                  <option value="">—</option>
                  {formCategories.map((c) => (
                    <option key={`${txType}-${c}`} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                {/* Show accounting type hint based on selected category */}
                {category && CATEGORY_ACCOUNTING_TYPE[category] && (
                  <p className="mt-1 text-xs text-slate-500">
                    Comptabilisé comme :{" "}
                    <span className="text-amber-400">
                      {ACCOUNTING_LABELS[CATEGORY_ACCOUNTING_TYPE[category]]}
                    </span>
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t("date")}</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t("note")}</label>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
                >
                  {tc("cancel")}
                </button>
                <button
                  type="submit"
                  className="flex-1 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700"
                >
                  {tc("save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Balance reconciliation ── */}
      {showForm && formMode === "adjustment" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-1 text-base font-semibold text-slate-50">
              Réconciliation de solde
            </h2>
            <p className="mb-4 text-xs text-slate-500">
              Aligne DANEX sur votre solde réel. La correction est enregistrée
              séparément et n'est pas comptée comme revenu ni dépense.
            </p>
            <form onSubmit={handleSubmitAdjustment} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-slate-400">Compte</label>
                <select
                  value={adjAccountId}
                  onChange={(e) => {
                    setAdjAccountId(e.target.value);
                    const acc = accounts.find((a) => a.id === e.target.value);
                    if (acc)
                      setAdjTargetBalance(String(Number(acc.balance).toFixed(2)));
                  }}
                  required
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none"
                >
                  <option value="">—</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} — solde actuel : {formatMoney(a.balance, a.currency)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">
                  Solde réel observé
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={adjTargetBalance}
                  onChange={(e) => setAdjTargetBalance(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none"
                />
                {adjDifference !== null && Math.abs(adjDifference) >= 0.001 && (
                  <p
                    className={`mt-1 text-xs ${
                      adjDifference > 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    Correction :{" "}
                    {adjDifference > 0 ? "+" : ""}
                    {formatMoney(adjDifference, adjAccount?.currency ?? "USD")}
                  </p>
                )}
                {adjDifference !== null && Math.abs(adjDifference) < 0.001 && (
                  <p className="mt-1 text-xs text-slate-500">
                    Aucune correction nécessaire.
                  </p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Date</label>
                <input
                  type="date"
                  value={adjDate}
                  onChange={(e) => setAdjDate(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Note</label>
                <input
                  placeholder="Ex : Comparaison avec Alipay réel"
                  value={adjNote}
                  onChange={(e) => setAdjNote(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
                >
                  {tc("cancel")}
                </button>
                <button
                  type="submit"
                  disabled={adjDifference !== null && Math.abs(adjDifference) < 0.001}
                  className="flex-1 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Appliquer la correction
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title={tc("confirm_delete")}
        message="Supprimer cette transaction ? Le solde du compte sera restauré."
        confirmLabel={tc("delete")}
        cancelLabel={tc("cancel")}
        danger
        onConfirm={async () => {
          if (deleteTarget) {
            await deleteTransaction(
              deleteTarget.id,
              deleteTarget.accountId,
              deleteTarget.type,
              deleteTarget.amount
            );
          }
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </PageWrapper>
  );
}
