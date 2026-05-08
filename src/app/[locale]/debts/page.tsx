"use client";

import { useState } from "react";
import { use } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useDebts } from "@/hooks/useDebts";
import { useAccounts } from "@/hooks/useAccounts";
import { useCurrencies } from "@/hooks/useCurrencies";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Card } from "@/components/ui/Card";
import { MoneyAmount } from "@/components/ui/MoneyAmount";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingPage } from "@/components/ui/LoadingSpinner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { DebtDirection, DebtPayment } from "@/lib/supabase/types";
import { formatDate, isOverdue } from "@/lib/utils";
import { Plus, Trash2, CreditCard, ChevronDown, ChevronUp } from "lucide-react";

type Props = { params: Promise<{ locale: string }> };

export default function DebtsPage({ params }: Props) {
  const { locale } = use(params);
  const t = useTranslations("debts");
  const tc = useTranslations("common");
  const { debts, loading, addDebt, addPayment, deleteDebt, getPayments } = useDebts();
  const { accounts } = useAccounts();
  const { currencies } = useCurrencies();

  const [tab, setTab] = useState<DebtDirection>("i_owe");
  const [showForm, setShowForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [payments, setPayments] = useState<DebtPayment[]>([]);

  // Debt form
  const [personName, setPersonName] = useState("");
  const [direction, setDirection] = useState<DebtDirection>("i_owe");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [linkedAccountId, setLinkedAccountId] = useState("");

  // Payment form
  const [payAmount, setPayAmount] = useState("");
  const [payAccountId, setPayAccountId] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().split("T")[0]);
  const [payNote, setPayNote] = useState("");

  const filtered = debts.filter((d) => d.direction === tab && d.status !== "paid");
  const paid = debts.filter((d) => d.direction === tab && d.status === "paid");

  async function handleAddDebt(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await addDebt(user.id, personName, direction, Number(amount), currency,
      dueDate || null, note || null, linkedAccountId || null);
    setShowForm(false);
    setPersonName(""); setAmount(""); setNote(""); setDueDate(""); setLinkedAccountId("");
  }

  async function handlePayment(e: React.FormEvent, debtId: string) {
    e.preventDefault();
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const debt = debts.find((d) => d.id === debtId);
    if (!debt) return;
    await addPayment(user.id, debt, Number(payAmount), payAccountId || null, payDate, payNote || null);
    setShowPaymentForm(null);
    setPayAmount(""); setPayNote("");
  }

  async function loadPayments(debtId: string) {
    if (expandedId === debtId) {
      setExpandedId(null);
      return;
    }
    const p = await getPayments(debtId);
    setPayments(p);
    setExpandedId(debtId);
  }

  const statusVariant: Record<string, "danger" | "warning" | "success"> = {
    unpaid: "danger", partial: "warning", paid: "success",
  };

  if (loading) return <PageWrapper locale={locale}><LoadingPage /></PageWrapper>;

  return (
    <PageWrapper locale={locale}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-bold text-slate-50">{t("title")}</h1>
          <button
            onClick={() => { setDirection(tab); setShowForm(true); }}
            className="flex items-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700"
          >
            <Plus size={15} />
            {t("add")}
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-lg border border-slate-800 bg-slate-900 p-1">
          {(["i_owe", "owes_me"] as DebtDirection[]).map((dir) => (
            <button
              key={dir}
              onClick={() => setTab(dir)}
              className={`flex-1 rounded-md py-1.5 text-sm font-medium transition ${
                tab === dir
                  ? "bg-orange-600 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              {t(dir)}
            </button>
          ))}
        </div>

        {filtered.length === 0 && paid.length === 0 ? (
          <EmptyState message={tc("empty")} />
        ) : (
          <div className="space-y-2">
            {[...filtered, ...paid].map((debt) => {
              const remaining = Number(debt.amount) - Number(debt.paid_amount);
              const progress = Math.min((Number(debt.paid_amount) / Number(debt.amount)) * 100, 100);
              const isExpanded = expandedId === debt.id;

              return (
                <Card key={debt.id}>
                  <article className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-base font-semibold text-slate-50">
                          {debt.person_name}
                        </h3>
                        <Badge variant={statusVariant[debt.status]}>
                          {t(`statuses.${debt.status}`)}
                        </Badge>
                        {debt.due_date && isOverdue(debt.due_date) && debt.status !== "paid" && (
                          <Badge variant="warning">{t("overdue")}</Badge>
                        )}
                      </div>
                      {debt.due_date && (
                        <p className="mt-0.5 text-xs text-slate-500">
                          {t("due_date")}: {formatDate(debt.due_date)}
                        </p>
                      )}
                      {debt.note && (
                        <p className="mt-0.5 truncate text-xs text-slate-600">{debt.note}</p>
                      )}
                      {/* Progress bar */}
                      <div className="mt-2">
                        <div className="mb-1 flex justify-between text-xs text-slate-500">
                          <span>{t("paid")}: <span className="font-mono">{Number(debt.paid_amount).toFixed(2)}</span></span>
                          <span>{t("remaining")}: <span className="font-mono">{remaining.toFixed(2)}</span></span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-800">
                          <div
                            className="h-1.5 rounded-full bg-orange-500 transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <MoneyAmount amount={debt.amount} currency={debt.currency} className="text-sm font-semibold text-slate-100" />
                      <div className="flex gap-1">
                        {debt.status !== "paid" && (
                          <button
                            onClick={() => { setShowPaymentForm(debt.id); setPayAmount(""); setPayNote(""); }}
                            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-orange-400"
                            title={t("add_payment")}
                          >
                            <CreditCard size={13} />
                          </button>
                        )}
                        <button
                          onClick={() => loadPayments(debt.id)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-300"
                        >
                          {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>
                        <button
                          onClick={() => setDeleteId(debt.id)}
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-red-400"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  </article>

                  {/* Payment history */}
                  {isExpanded && (
                    <div className="mt-3 border-t border-slate-800 pt-3">
                      <p className="mb-2 text-xs font-medium text-slate-500">{t("payment_history")}</p>
                      {payments.length === 0 ? (
                        <p className="text-xs text-slate-600">—</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {payments.map((p) => (
                            <li key={p.id} className="flex items-center justify-between gap-4">
                              <div className="min-w-0 flex-1">
                                <span className="text-xs text-slate-400">{formatDate(p.payment_date)}</span>
                                {p.note && <span className="ml-2 text-xs text-slate-600">{p.note}</span>}
                              </div>
                              <MoneyAmount amount={p.amount} currency={debt.currency} className="shrink-0 text-xs text-emerald-400" />
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Add debt modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-base font-semibold text-slate-50">{t("add")}</h2>
            <form onSubmit={handleAddDebt} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t("person")}</label>
                <input value={personName} onChange={(e) => setPersonName(e.target.value)} required
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Direction</label>
                <div className="flex gap-2">
                  {(["i_owe", "owes_me"] as DebtDirection[]).map((dir) => (
                    <button key={dir} type="button" onClick={() => setDirection(dir)}
                      className={`flex-1 rounded-lg py-2 text-xs font-medium transition ${direction === dir ? "bg-orange-600 text-white" : "border border-slate-700 text-slate-400 hover:bg-slate-800"}`}>
                      {t(dir)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t("amount")}</label>
                <input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Devise</label>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none">
                  {currencies.map((c) => (
                    <option key={c.code} value={c.code}>{c.code}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t("due_date")}</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t("linked_account")}</label>
                <select value={linkedAccountId} onChange={(e) => setLinkedAccountId(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none">
                  <option value="">—</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t("note")}</label>
                <input value={note} onChange={(e) => setNote(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">{tc("cancel")}</button>
                <button type="submit"
                  className="flex-1 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700">{tc("save")}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment modal */}
      {showPaymentForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-base font-semibold text-slate-50">{t("add_payment")}</h2>
            <form onSubmit={(e) => handlePayment(e, showPaymentForm)} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t("amount")}</label>
                <input type="number" step="0.01" min="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} required
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t("linked_account")}</label>
                <select value={payAccountId} onChange={(e) => setPayAccountId(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none">
                  <option value="">— (sans compte)</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Date</label>
                <input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} required
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t("note")}</label>
                <input value={payNote} onChange={(e) => setPayNote(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowPaymentForm(null)}
                  className="flex-1 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">{tc("cancel")}</button>
                <button type="submit"
                  className="flex-1 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700">{tc("save")}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        title={tc("confirm_delete")}
        message="Supprimer cette dette ?"
        confirmLabel={tc("delete")}
        cancelLabel={tc("cancel")}
        danger
        onConfirm={async () => { if (deleteId) await deleteDebt(deleteId); setDeleteId(null); }}
        onCancel={() => setDeleteId(null)}
      />
    </PageWrapper>
  );
}
