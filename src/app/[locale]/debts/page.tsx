"use client";

import { useState, useMemo } from "react";
import { use } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useDebts } from "@/hooks/useDebts";
import { useAccounts } from "@/hooks/useAccounts";
import { useCurrencies } from "@/hooks/useCurrencies";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Card } from "@/components/ui/Card";
import { MoneyAmount } from "@/components/ui/MoneyAmount";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { MetricCard } from "@/components/ui/MetricCard";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { DebtDirection, DebtPayment, SettlementMethod } from "@/lib/supabase/types";
import { formatDate, isOverdue } from "@/lib/utils";
import { formatMoney } from "@/lib/currency";
import { Plus, Trash2, CreditCard, ChevronDown, ChevronUp, X, AlertTriangle, Clock } from "lucide-react";

// ── Settlement labels ─────────────────────────────────────────────────────────

const SETTLEMENT_LABELS: Record<SettlementMethod, string> = {
  real_payment:       "Paiement réel (depuis un compte)",
  compensation:       "Compensation / Règlement sans mouvement",
  linked_transaction: "Lié à une transaction existante",
};

const SETTLEMENT_DESCRIPTIONS: Record<SettlementMethod, string> = {
  real_payment:       "L'argent sort ou entre réellement dans le compte sélectionné.",
  compensation:       "La dette est réglée via une opération déjà enregistrée. Aucun mouvement sur le compte.",
  linked_transaction: "Règlement lié à une transaction existante. Aucun mouvement supplémentaire.",
};

const SETTLEMENT_BADGE: Record<SettlementMethod, string> = {
  real_payment:       "Paiement réel",
  compensation:       "Compensation",
  linked_transaction: "Tx liée",
};

const fieldCls =
  "w-full rounded-xl border border-slate-700/80 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-orange-500/70 focus:outline-none focus:ring-1 focus:ring-orange-500/20";

type Props = { params: Promise<{ locale: string }> };

export default function DebtsPage({ params }: Props) {
  const { locale } = use(params);
  const t  = useTranslations("debts");
  const tc = useTranslations("common");
  const router = useRouter();
  const { debts, loading, addDebt, addPayment, deleteDebt, getPayments } = useDebts();
  const { accounts } = useAccounts();
  const { currencies } = useCurrencies();

  const [tab, setTab]                       = useState<DebtDirection>("i_owe");
  const [showForm, setShowForm]             = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState<string | null>(null);
  const [deleteId, setDeleteId]             = useState<string | null>(null);
  const [expandedId, setExpandedId]         = useState<string | null>(null);
  const [payments, setPayments]             = useState<DebtPayment[]>([]);
  const [filterOverdue, setFilterOverdue]   = useState(false);
  const [payError, setPayError]             = useState<string | null>(null);
  const [saving, setSaving]                 = useState(false);
  const [formError, setFormError]           = useState<string | null>(null);
  const [deleteError, setDeleteError]       = useState<string | null>(null);

  // Debt form
  const [personName, setPersonName]         = useState("");
  const [direction, setDirection]           = useState<DebtDirection>("i_owe");
  const [amount, setAmount]                 = useState("");
  const [currency, setCurrency]             = useState("USD");
  const [dueDate, setDueDate]               = useState("");
  const [note, setNote]                     = useState("");
  const [linkedAccountId, setLinkedAccountId] = useState("");
  const [affectsBalance, setAffectsBalance] = useState(false);

  // Payment form
  const [payAmount, setPayAmount]           = useState("");
  const [payAccountId, setPayAccountId]     = useState("");
  const [payDate, setPayDate]               = useState(new Date().toISOString().split("T")[0]);
  const [payNote, setPayNote]               = useState("");
  const [settlementMethod, setSettlementMethod] = useState<SettlementMethod>("real_payment");

  // ── Derived ──────────────────────────────────────────────────────────────────

  const filteredActive = useMemo(() => {
    let list = debts.filter((d) => d.direction === tab && d.status !== "paid");
    if (filterOverdue) list = list.filter((d) => d.due_date && isOverdue(d.due_date));
    return list;
  }, [debts, tab, filterOverdue]);

  const paid = useMemo(
    () => debts.filter((d) => d.direction === tab && d.status === "paid"),
    [debts, tab]
  );

  const tabSummary = useMemo(() => {
    const active = debts.filter((d) => d.direction === tab && d.status !== "paid");
    const totalRemaining = active.reduce(
      (sum, d) => sum + Math.max(0, Number(d.amount) - Number(d.paid_amount)),
      0
    );
    const overdueCount = active.filter((d) => d.due_date && isOverdue(d.due_date)).length;
    const soonCount = active.filter((d) => {
      if (!d.due_date || isOverdue(d.due_date)) return false;
      const daysLeft = Math.ceil((new Date(d.due_date).getTime() - Date.now()) / 86400000);
      return daysLeft <= 7;
    }).length;
    return { totalRemaining, overdueCount, soonCount, activeCount: active.length };
  }, [debts, tab]);

  const currentDebt = useMemo(
    () => debts.find((d) => d.id === showPaymentForm) ?? null,
    [debts, showPaymentForm]
  );
  const currentRemaining = currentDebt
    ? Math.max(0, Number(currentDebt.amount) - Number(currentDebt.paid_amount))
    : 0;

  const debtToDelete = useMemo(
    () => debts.find((d) => d.id === deleteId) ?? null,
    [debts, deleteId]
  );

  const statusVariant: Record<string, "danger" | "warning" | "success"> = {
    unpaid: "danger", partial: "warning", paid: "success",
  };

  // ── Handlers ──────────────────────────────────────────────────────────────────

  async function handleAddDebt(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setFormError(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setFormError("Session expirée. Reconnecte-toi."); return; }
      await addDebt(
        user.id, personName, direction, Number(amount), currency,
        dueDate || null, note || null, linkedAccountId || null,
        direction === "owes_me" ? affectsBalance : false
      );
      setShowForm(false);
      setPersonName(""); setAmount(""); setNote("");
      setDueDate(""); setLinkedAccountId(""); setAffectsBalance(false);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Une erreur est survenue. Réessaie.");
    } finally {
      setSaving(false);
    }
  }

  async function handlePayment(e: React.FormEvent, debtId: string) {
    e.preventDefault();
    setPayError(null);
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const debt = debts.find((d) => d.id === debtId);
    if (!debt) return;
    try {
      await addPayment(
        user.id, debt, Number(payAmount),
        settlementMethod === "real_payment" ? (payAccountId || null) : null,
        payDate, payNote || null, settlementMethod
      );
      setShowPaymentForm(null);
      setPayAmount(""); setPayNote(""); setPayAccountId("");
      setSettlementMethod("real_payment");
      // Invalidate the Next.js client-side router cache so a subsequent
      // navigation to /fr/accounts fetches the updated account balance.
      router.refresh();
    } catch (err: unknown) {
      setPayError(err instanceof Error ? err.message : "Erreur lors du paiement.");
    }
  }

  async function loadPayments(debtId: string) {
    if (expandedId === debtId) { setExpandedId(null); return; }
    const p = await getPayments(debtId);
    setPayments(p);
    setExpandedId(debtId);
  }

  function openPaymentForm(debtId: string) {
    setShowPaymentForm(debtId);
    setPayAmount(""); setPayNote(""); setPayAccountId("");
    setPayDate(new Date().toISOString().split("T")[0]);
    setSettlementMethod("real_payment"); setPayError(null);
  }

  // ── Loading ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <PageWrapper locale={locale}>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="h-7 w-40 animate-pulse rounded-lg bg-slate-800" />
            <div className="h-9 w-36 animate-pulse rounded-lg bg-slate-800" />
          </div>
          <div className="h-10 animate-pulse rounded-xl bg-slate-800" />
          <SkeletonList count={4} />
        </div>
      </PageWrapper>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  const iOweCount   = debts.filter((d) => d.direction === "i_owe"   && d.status !== "paid").length;
  const owesMeCount = debts.filter((d) => d.direction === "owes_me" && d.status !== "paid").length;

  return (
    <PageWrapper locale={locale}>
      <div className="space-y-4">

        {/* ── Header ── */}
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold text-slate-50">{t("title")}</h1>
          <button
            onClick={() => { setDirection(tab); setAffectsBalance(false); setShowForm(true); }}
            aria-label={t("add")}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-500"
          >
            <Plus size={15} />
            <span className="hidden sm:inline">{t("add")}</span>
          </button>
        </div>

        {/* ── Tab switch ── */}
        <SegmentedControl
          tabs={[
            { value: "i_owe"   as DebtDirection, label: t("i_owe"),   count: iOweCount },
            { value: "owes_me" as DebtDirection, label: t("owes_me"), count: owesMeCount },
          ]}
          value={tab}
          onChange={(v) => { setTab(v); setFilterOverdue(false); }}
        />

        {/* ── Summary cards ── */}
        {tabSummary.activeCount > 0 && (
          <div className="grid grid-cols-2 gap-3">
            <MetricCard
              label={tab === "i_owe" ? "À rembourser" : "À recevoir"}
              value={tabSummary.totalRemaining}
              currency={debts.find((d) => d.direction === tab)?.currency ?? "USD"}
              color={tab === "i_owe" ? "red" : "green"}
              note={`${tabSummary.activeCount} en cours`}
            />
            <div className="flex flex-col rounded-xl border border-slate-800 bg-slate-900 p-4">
              <p className="text-xs font-medium text-slate-400">En retard</p>
              <p className={`mt-1 font-mono text-xl font-bold tabular-nums ${
                tabSummary.overdueCount > 0 ? "text-red-400" : "text-slate-600"
              }`}>
                {tabSummary.overdueCount}
              </p>
              {tabSummary.soonCount > 0 && (
                <p className="mt-1 flex items-center gap-1 text-[10px] text-amber-400">
                  <Clock size={9} />
                  {tabSummary.soonCount} bientôt échu
                </p>
              )}
              {tabSummary.overdueCount === 0 && tabSummary.soonCount === 0 && (
                <p className="mt-1 text-[10px] text-slate-600">Tout à jour</p>
              )}
            </div>
          </div>
        )}

        {/* ── Overdue filter pill ── */}
        {tabSummary.overdueCount > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilterOverdue(!filterOverdue)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                filterOverdue
                  ? "border-red-600/60 bg-red-950/40 text-red-300"
                  : "border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300"
              }`}
            >
              <AlertTriangle size={9} />
              En retard seulement
            </button>
          </div>
        )}

        {/* ── List ── */}
        {filteredActive.length === 0 && paid.length === 0 ? (
          <EmptyState message={tc("empty")} />
        ) : filterOverdue && filteredActive.length === 0 ? (
          <EmptyState message="Aucune dette en retard." />
        ) : (
          <div className="space-y-2">
            {filteredActive.length > 0 && <SectionHeader label="En cours" />}

            {[...filteredActive, ...(!filterOverdue ? paid : [])].map((debt, idx) => {
              const showPaidHeader =
                !filterOverdue && idx === filteredActive.length && paid.length > 0;
              const remaining  = Number(debt.amount) - Number(debt.paid_amount);
              const progress   = Math.min((Number(debt.paid_amount) / Number(debt.amount)) * 100, 100);
              const isExpanded = expandedId === debt.id;
              const overdue    = debt.due_date && isOverdue(debt.due_date) && debt.status !== "paid";
              const soon       = !overdue && debt.due_date && (() => {
                const d = Math.ceil((new Date(debt.due_date).getTime() - Date.now()) / 86400000);
                return d >= 0 && d <= 7;
              })();

              return (
                <div key={debt.id}>
                  {showPaidHeader && <SectionHeader label="Réglées" />}

                  <Card className={`transition-colors hover:border-slate-600 ${
                    overdue ? "border-red-900/30" : ""
                  }`}>
                    <article>
                      {/* ── Top row ── */}
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          {/* Name + badges */}
                          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                            <h3 className="min-w-0 truncate text-sm font-semibold text-slate-100">
                              {debt.person_name}
                            </h3>
                            <Badge variant={statusVariant[debt.status]}>
                              {t(`statuses.${debt.status}`)}
                            </Badge>
                            {overdue && (
                              <span className="shrink-0 flex items-center gap-0.5 rounded-full bg-red-950/50 px-2 py-0.5 text-[10px] font-medium text-red-300">
                                <AlertTriangle size={8} />
                                {t("overdue")}
                              </span>
                            )}
                            {soon && (
                              <span className="shrink-0 flex items-center gap-0.5 rounded-full bg-amber-950/40 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                                <Clock size={8} />
                                Bientôt
                              </span>
                            )}
                          </div>

                          {/* Due date */}
                          {debt.due_date && (
                            <p className={`mt-0.5 text-[11px] ${
                              overdue ? "text-red-400/70" : "text-slate-600"
                            }`}>
                              {t("due_date")}: {formatDate(debt.due_date)}
                            </p>
                          )}
                        </div>

                        {/* Amount + actions */}
                        <div className="flex shrink-0 items-start gap-0.5">
                          <div className="mr-1.5 text-right">
                            <p className={`font-mono text-sm font-bold tabular-nums ${
                              debt.status === "paid"
                                ? "text-slate-500"
                                : tab === "i_owe" ? "text-red-400" : "text-emerald-400"
                            }`}>
                              {formatMoney(remaining, debt.currency)}
                            </p>
                            {Number(debt.paid_amount) > 0 && (
                              <p className="text-[10px] text-slate-700">
                                / {formatMoney(Number(debt.amount), debt.currency)}
                              </p>
                            )}
                          </div>
                          {debt.status !== "paid" && (
                            <button
                              onClick={() => openPaymentForm(debt.id)}
                              aria-label={t("add_payment")}
                              title={t("add_payment")}
                              className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-slate-800 hover:text-orange-400"
                            >
                              <CreditCard size={13} />
                            </button>
                          )}
                          <button
                            onClick={() => loadPayments(debt.id)}
                            aria-label={isExpanded ? "Réduire" : "Voir historique"}
                            className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-slate-800 hover:text-slate-300"
                          >
                            {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                          </button>
                          <button
                            onClick={() => setDeleteId(debt.id)}
                            aria-label="Supprimer"
                            className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-slate-800 hover:text-red-400"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      {/* Progress bar */}
                      {Number(debt.amount) > 0 && Number(debt.paid_amount) > 0 && (
                        <div className="mt-2.5">
                          <div className="h-1 w-full rounded-full bg-slate-800">
                            <div
                              className={`h-1 rounded-full transition-all ${
                                debt.status === "paid" ? "bg-emerald-500" : "bg-orange-500"
                              }`}
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                          <p className="mt-0.5 text-right text-[10px] text-slate-700">
                            {Math.round(progress)}% remboursé
                          </p>
                        </div>
                      )}

                      {/* Note */}
                      {debt.note && (
                        <p className="mt-1.5 truncate text-[11px] text-slate-700">{debt.note}</p>
                      )}
                    </article>

                    {/* ── Payment history ── */}
                    {isExpanded && (
                      <div className="mt-3 border-t border-slate-800 pt-3">
                        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                          {t("payment_history")}
                        </p>
                        {payments.length === 0 ? (
                          <p className="text-xs text-slate-600">Aucun paiement enregistré.</p>
                        ) : (
                          <ul className="space-y-1.5">
                            {payments.map((p) => {
                              const payAcc = accounts.find((a) => a.id === p.account_id);
                              const method = p.settlement_method as SettlementMethod;
                              return (
                                <li key={p.id} className="flex items-center justify-between gap-3">
                                  <div className="min-w-0 flex-1">
                                    <span className="text-xs text-slate-400">
                                      {formatDate(p.payment_date)}
                                    </span>
                                    {payAcc && (
                                      <span className="ml-2 text-[11px] text-slate-500">
                                        · {payAcc.name}
                                      </span>
                                    )}
                                    {method !== "real_payment" && (
                                      <span className="ml-2 rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-400">
                                        {SETTLEMENT_BADGE[method]}
                                      </span>
                                    )}
                                    {p.note && (
                                      <span className="ml-2 text-[11px] text-slate-600">{p.note}</span>
                                    )}
                                  </div>
                                  <MoneyAmount
                                    amount={p.amount}
                                    currency={debt.currency}
                                    className="shrink-0 font-mono text-xs tabular-nums text-emerald-400"
                                  />
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    )}
                  </Card>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Modal: Ajouter une dette ──────────────────────────────────────────── */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm md:items-center md:p-4"
          onClick={() => setShowForm(false)}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-md flex-col rounded-t-2xl border border-slate-800 bg-slate-950 shadow-2xl md:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-2.5 md:hidden">
              <div className="h-1 w-10 rounded-full bg-slate-700" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pb-3 pt-4">
              <h2 className="text-base font-bold text-slate-50">{t("add")}</h2>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleAddDebt} className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto px-5 pb-2">
                <div className="space-y-4 py-1">

                  {/* Person */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
                      {t("person")}
                    </label>
                    <input
                      value={personName}
                      onChange={(e) => setPersonName(e.target.value)}
                      required
                      placeholder="Nom ou prénom"
                      className={fieldCls}
                    />
                  </div>

                  {/* Direction */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
                      Direction
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      {(["i_owe", "owes_me"] as DebtDirection[]).map((dir) => (
                        <button
                          key={dir}
                          type="button"
                          onClick={() => { setDirection(dir); setAffectsBalance(false); }}
                          className={`rounded-xl py-2.5 text-xs font-medium transition-colors ${
                            direction === dir
                              ? "bg-orange-600 text-white"
                              : "border border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                          }`}
                        >
                          {t(dir)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Amount + Currency */}
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="mb-1.5 block text-xs font-medium text-slate-400">
                        {t("amount")}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        required
                        placeholder="0.00"
                        className={`${fieldCls} font-mono tabular-nums`}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-400">
                        Devise
                      </label>
                      <select
                        value={currency}
                        onChange={(e) => setCurrency(e.target.value)}
                        className={fieldCls}
                      >
                        {currencies.map((c) => (
                          <option key={c.code} value={c.code}>{c.code}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Due date */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
                      {t("due_date")} <span className="text-slate-600">(optionnel)</span>
                    </label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={(e) => setDueDate(e.target.value)}
                      className={fieldCls}
                    />
                  </div>

                  {/* Linked account */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
                      Compte lié{" "}
                      <span className="text-slate-600">
                        {direction === "owes_me" ? "(facultatif)" : "(référence)"}
                      </span>
                    </label>
                    <select
                      value={linkedAccountId}
                      onChange={(e) => setLinkedAccountId(e.target.value)}
                      className={fieldCls}
                    >
                      <option value="">—</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Affects balance (owes_me only) */}
                  {direction === "owes_me" && linkedAccountId && (
                    <div className="rounded-xl border border-slate-700/60 bg-slate-900/60 p-3.5">
                      <label className="flex cursor-pointer items-start gap-3">
                        <input
                          type="checkbox"
                          checked={affectsBalance}
                          onChange={(e) => setAffectsBalance(e.target.checked)}
                          className="mt-0.5 h-4 w-4 accent-orange-500"
                        />
                        <span className="text-xs text-slate-300">
                          L'argent a réellement quitté ce compte
                        </span>
                      </label>
                      <p className={`mt-1.5 text-[11px] ${affectsBalance ? "text-amber-400" : "text-slate-600"}`}>
                        {affectsBalance
                          ? `Le solde sera réduit de ${amount || "…"} ${currency}.`
                          : "Déclaration seulement — aucun compte ne sera modifié."}
                      </p>
                    </div>
                  )}

                  {/* Note */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
                      {t("note")} <span className="text-slate-600">(optionnel)</span>
                    </label>
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Remarque…"
                      className={fieldCls}
                    />
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div
                className="shrink-0 border-t border-slate-800 px-5 pt-3"
                style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))" }}
              >
                {formError && (
                  <p className="mb-3 rounded-xl bg-red-900/30 px-4 py-2.5 text-center text-xs text-red-400">{formError}</p>
                )}
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="flex-1 rounded-xl border border-slate-700 py-2.5 text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
                  >
                    {tc("cancel")}
                  </button>
                  <button
                    type="submit"
                    disabled={!personName.trim() || !amount || saving}
                    className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors bg-orange-600 text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                  >
                    {saving ? "Sauvegarde en cours…" : tc("save")}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Enregistrer un paiement ───────────────────────────────────── */}
      {showPaymentForm && currentDebt && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm md:items-center md:p-4"
          onClick={() => { setShowPaymentForm(null); setPayError(null); }}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-md flex-col rounded-t-2xl border border-slate-800 bg-slate-950 shadow-2xl md:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-2.5 md:hidden">
              <div className="h-1 w-10 rounded-full bg-slate-700" />
            </div>

            {/* Header */}
            <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
              <div>
                <h2 className="text-base font-bold text-slate-50">{t("add_payment")}</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {currentDebt.person_name} · Restant :{" "}
                  <span className="font-mono tabular-nums text-slate-300">
                    {formatMoney(currentRemaining, currentDebt.currency)}
                  </span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setShowPaymentForm(null); setPayError(null); }}
                className="shrink-0 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
              >
                <X size={16} />
              </button>
            </div>

            <form
              onSubmit={(e) => handlePayment(e, showPaymentForm)}
              className="flex flex-1 flex-col overflow-hidden"
            >
              <div className="flex-1 overflow-y-auto px-5 pb-2">
                <div className="space-y-4 py-1">

                  {/* Settlement method */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
                      Mode de règlement
                    </label>
                    <div className="space-y-2">
                      {(["real_payment", "compensation", "linked_transaction"] as SettlementMethod[]).map((method) => (
                        <label
                          key={method}
                          className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                            settlementMethod === method
                              ? "border-orange-600/60 bg-orange-950/20"
                              : "border-slate-700/80 hover:border-slate-600"
                          }`}
                        >
                          <input
                            type="radio"
                            name="settlementMethod"
                            value={method}
                            checked={settlementMethod === method}
                            onChange={() => setSettlementMethod(method)}
                            className="mt-0.5 accent-orange-500"
                          />
                          <div>
                            <p className="text-xs font-medium text-slate-200">
                              {SETTLEMENT_LABELS[method]}
                            </p>
                            <p className="mt-0.5 text-[10px] text-slate-500">
                              {SETTLEMENT_DESCRIPTIONS[method]}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Amount */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
                      {t("amount")}
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        max={currentRemaining}
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        required
                        placeholder="0.00"
                        className={`${fieldCls} min-w-0 flex-1 font-mono tabular-nums`}
                      />
                      <button
                        type="button"
                        onClick={() => setPayAmount(currentRemaining.toFixed(2))}
                        className="shrink-0 rounded-xl border border-orange-700/60 bg-orange-950/30 px-3 py-2.5 text-xs font-medium text-orange-400 transition-colors hover:bg-orange-950/50"
                      >
                        Tout
                      </button>
                    </div>
                  </div>

                  {/* Account */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
                      {settlementMethod === "real_payment"
                        ? t("linked_account")
                        : "Compte (référence seulement)"}
                    </label>
                    <select
                      value={payAccountId}
                      onChange={(e) => setPayAccountId(e.target.value)}
                      required={settlementMethod === "real_payment"}
                      className={fieldCls}
                    >
                      <option value="">— (sans compte)</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.currency})
                        </option>
                      ))}
                    </select>
                    {settlementMethod !== "real_payment" && (
                      <p className="mt-1.5 text-[11px] text-amber-400/80">
                        Aucun mouvement de solde — règlement par compensation.
                      </p>
                    )}
                  </div>

                  {/* Date */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">Date</label>
                    <input
                      type="date"
                      value={payDate}
                      onChange={(e) => setPayDate(e.target.value)}
                      required
                      className={fieldCls}
                    />
                  </div>

                  {/* Note */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
                      {t("note")} <span className="text-slate-600">(optionnel)</span>
                    </label>
                    <input
                      value={payNote}
                      onChange={(e) => setPayNote(e.target.value)}
                      placeholder={
                        settlementMethod === "compensation"
                          ? "Ex : réglé via achat souris 768 RMB"
                          : "Remarque…"
                      }
                      className={fieldCls}
                    />
                  </div>

                  {/* Error */}
                  {payError && (
                    <div className="rounded-xl border border-red-800/50 bg-red-950/30 px-3.5 py-2.5">
                      <p className="text-xs text-red-400">{payError}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div
                className="shrink-0 border-t border-slate-800 px-5 pt-3"
                style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))" }}
              >
                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => { setShowPaymentForm(null); setPayError(null); }}
                    className="flex-1 rounded-xl border border-slate-700 py-2.5 text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
                  >
                    {tc("cancel")}
                  </button>
                  <button
                    type="submit"
                    disabled={!payAmount}
                    className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors bg-orange-600 text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                  >
                    {tc("save")}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Confirm delete ── */}
      <ConfirmDialog
        open={!!deleteId}
        title={tc("confirm_delete")}
        message={
          debtToDelete && Number(debtToDelete.paid_amount) > 0
            ? `Cette dette a ${formatMoney(debtToDelete.paid_amount, debtToDelete.currency)} de paiements enregistrés. Les effets sur les comptes seront annulés. Continuer ?`
            : "Supprimer cette dette ?"
        }
        confirmLabel={tc("delete")}
        cancelLabel={tc("cancel")}
        danger
        onConfirm={async () => {
          if (!deleteId) return;
          try {
            await deleteDebt(deleteId);
            setDeleteId(null);
            setDeleteError(null);
          } catch (err: unknown) {
            setDeleteError(err instanceof Error ? err.message : "Échec de la suppression.");
            // Keep dialog open so the user sees the error; they can retry or cancel
          }
        }}
        message={
          deleteError
            ? `Erreur : ${deleteError}`
            : debtToDelete && Number(debtToDelete.paid_amount) > 0
            ? `Cette dette a ${formatMoney(debtToDelete.paid_amount, debtToDelete.currency)} de paiements enregistrés. Les effets sur les comptes seront annulés. Continuer ?`
            : "Supprimer cette dette ?"
        }
        onCancel={() => setDeleteId(null)}
      />
    </PageWrapper>
  );
}
