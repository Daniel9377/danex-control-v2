"use client";

import { useState } from "react";
import { use } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useTransfers } from "@/hooks/useTransfers";
import { useAccounts } from "@/hooks/useAccounts";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Card } from "@/components/ui/Card";
import { MoneyAmount } from "@/components/ui/MoneyAmount";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingPage } from "@/components/ui/LoadingSpinner";
import { formatDate } from "@/lib/utils";
import { Plus, ArrowRight } from "lucide-react";

type Props = { params: Promise<{ locale: string }> };

export default function TransfersPage({ params }: Props) {
  const { locale } = use(params);
  const t = useTranslations("transfers");
  const tc = useTranslations("common");
  const { transfers, loading: txLoading, addTransfer } = useTransfers();
  const { accounts, loading: accLoading } = useAccounts();

  const [showForm, setShowForm] = useState(false);
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [exchangeRate, setExchangeRate] = useState("1");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [note, setNote] = useState("");

  const fromAcc = accounts.find((a) => a.id === fromId);
  const toAcc = accounts.find((a) => a.id === toId);
  const sameCurrency = fromAcc?.currency === toAcc?.currency;

  function handleFromAmountChange(v: string) {
    setFromAmount(v);
    if (sameCurrency) setToAmount(v);
    else if (exchangeRate) {
      const rate = Number(exchangeRate);
      if (rate > 0) setToAmount((Number(v) * rate).toFixed(2));
    }
  }

  function handleRateChange(v: string) {
    setExchangeRate(v);
    const rate = Number(v);
    if (rate > 0 && fromAmount) {
      setToAmount((Number(fromAmount) * rate).toFixed(2));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !fromId || !toId || fromId === toId) return;

    await addTransfer(
      user.id, fromId, toId,
      Number(fromAmount), Number(toAmount),
      fromAcc?.currency ?? "USD", toAcc?.currency ?? "USD",
      Number(exchangeRate), date, note || null
    );
    setShowForm(false);
    setFromAmount(""); setToAmount(""); setNote(""); setExchangeRate("1");
  }

  if (txLoading || accLoading) return <PageWrapper locale={locale}><LoadingPage /></PageWrapper>;

  return (
    <PageWrapper locale={locale}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-bold text-slate-50">{t("title")}</h1>
          <button
            onClick={() => { setFromId(accounts[0]?.id ?? ""); setToId(accounts[1]?.id ?? ""); setShowForm(true); }}
            className="flex items-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700"
          >
            <Plus size={15} />
            {t("add")}
          </button>
        </div>

        {transfers.length === 0 ? (
          <EmptyState message={tc("empty")} />
        ) : (
          <div className="space-y-2">
            {transfers.map((tr) => {
              const from = accounts.find((a) => a.id === tr.from_account_id);
              const to = accounts.find((a) => a.id === tr.to_account_id);
              return (
                <Card key={tr.id}>
                  <article className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm text-slate-200">
                        <span className="truncate">{from?.name ?? "?"}</span>
                        <ArrowRight size={13} className="shrink-0 text-orange-500" />
                        <span className="truncate">{to?.name ?? "?"}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {formatDate(tr.transfer_date)}
                        {tr.note && ` · ${tr.note}`}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <MoneyAmount amount={tr.from_amount} currency={tr.from_currency} className="text-sm text-red-400" />
                      <MoneyAmount amount={tr.to_amount} currency={tr.to_currency} className="text-sm text-emerald-400" />
                    </div>
                  </article>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-base font-semibold text-slate-50">{t("add")}</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t("from")}</label>
                <select
                  value={fromId}
                  onChange={(e) => setFromId(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none"
                >
                  <option value="">—</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t("to")}</label>
                <select
                  value={toId}
                  onChange={(e) => setToId(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none"
                >
                  <option value="">—</option>
                  {accounts.filter((a) => a.id !== fromId).map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t("from_amount")}</label>
                <input
                  type="number" step="0.01" min="0.01"
                  value={fromAmount}
                  onChange={(e) => handleFromAmountChange(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none"
                />
              </div>
              {!sameCurrency && (
                <div>
                  <label className="mb-1 block text-xs text-slate-400">{t("exchange_rate")}</label>
                  <input
                    type="number" step="0.0001" min="0.0001"
                    value={exchangeRate}
                    onChange={(e) => handleRateChange(e.target.value)}
                    required
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none"
                  />
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t("to_amount")}</label>
                <input
                  type="number" step="0.01"
                  value={toAmount}
                  onChange={(e) => setToAmount(e.target.value)}
                  required
                  readOnly={sameCurrency}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none disabled:opacity-60"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t("date")}</label>
                <input
                  type="date" value={date}
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
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800">
                  {tc("cancel")}
                </button>
                <button type="submit"
                  className="flex-1 rounded-lg bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700">
                  {tc("save")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
