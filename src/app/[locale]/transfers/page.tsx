"use client";

import { useState, useMemo } from "react";
import { use } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useTransfers } from "@/hooks/useTransfers";
import { useAccounts } from "@/hooks/useAccounts";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingPage } from "@/components/ui/LoadingSpinner";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { formatDate } from "@/lib/utils";
import { formatMoney } from "@/lib/currency";
import { Plus, ArrowRight, ChevronDown, X } from "lucide-react";

type Props = { params: Promise<{ locale: string }> };

const fieldCls =
  "w-full rounded-xl border border-slate-700/80 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-orange-500/70 focus:outline-none focus:ring-1 focus:ring-orange-500/20";

export default function TransfersPage({ params }: Props) {
  const { locale } = use(params);
  const t  = useTranslations("transfers");
  const tc = useTranslations("common");
  const { transfers, loading: txLoading, addTransfer } = useTransfers();
  const { accounts, loading: accLoading } = useAccounts();

  const [showForm, setShowForm]           = useState(false);
  const [fromId, setFromId]               = useState("");
  const [toId, setToId]                   = useState("");
  const [fromAmount, setFromAmount]       = useState("");
  const [toAmount, setToAmount]           = useState("");
  const [exchangeRate, setExchangeRate]   = useState("1");
  const [date, setDate]                   = useState(new Date().toISOString().split("T")[0]);
  const [note, setNote]                   = useState("");
  const [filterAccount, setFilterAccount] = useState("");
  const [openDropdown, setOpenDropdown]   = useState(false);

  // ── Derived ───────────────────────────────────────────────────────────────────

  const fromAcc    = accounts.find((a) => a.id === fromId);
  const toAcc      = accounts.find((a) => a.id === toId);
  const sameCurrency = fromAcc?.currency === toAcc?.currency;
  const sameAccount  = !!fromId && fromId === toId;

  const filtered = useMemo(() => {
    if (!filterAccount) return transfers;
    return transfers.filter(
      (tr) => tr.from_account_id === filterAccount || tr.to_account_id === filterAccount
    );
  }, [transfers, filterAccount]);

  const summary = useMemo(() => {
    const now = new Date();
    const monthTx = transfers.filter((tr) => {
      const d = new Date(tr.transfer_date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const last = transfers[0] ?? null;
    return { thisMonthCount: monthTx.length, last };
  }, [transfers]);

  const filterLabel = filterAccount
    ? (accounts.find((a) => a.id === filterAccount)?.name ?? "Compte")
    : "Tous les comptes";

  const canSave = !!fromId && !!toId && !sameAccount && !!fromAmount && Number(fromAmount) > 0;

  // ── Handlers ──────────────────────────────────────────────────────────────────

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
    if (rate > 0 && fromAmount) setToAmount((Number(fromAmount) * rate).toFixed(2));
  }

  function openForm() {
    setFromId(accounts[0]?.id ?? "");
    setToId(accounts[1]?.id ?? "");
    setFromAmount(""); setToAmount(""); setNote("");
    setExchangeRate("1");
    setDate(new Date().toISOString().split("T")[0]);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await addTransfer(
      user.id, fromId, toId,
      Number(fromAmount), Number(toAmount),
      fromAcc?.currency ?? "USD", toAcc?.currency ?? "USD",
      Number(exchangeRate), date, note || null
    );
    setShowForm(false);
    setFromAmount(""); setToAmount(""); setNote(""); setExchangeRate("1");
  }

  // ── Loading ───────────────────────────────────────────────────────────────────

  if (txLoading || accLoading) return <PageWrapper locale={locale}><LoadingPage /></PageWrapper>;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <PageWrapper locale={locale}>
      <div className="space-y-4">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-50">{t("title")}</h1>
            {transfers.length > 0 && (
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                <span className="text-slate-500">
                  {transfers.length} transfert{transfers.length !== 1 ? "s" : ""}
                </span>
                {summary.thisMonthCount > 0 && (
                  <span className="text-slate-500">
                    Ce mois :{" "}
                    <span className="text-slate-400">{summary.thisMonthCount}</span>
                  </span>
                )}
                {summary.last && (
                  <span className="text-slate-600">
                    Dernier : {formatDate(summary.last.transfer_date)}
                  </span>
                )}
              </div>
            )}
          </div>
          <button
            onClick={openForm}
            aria-label={t("add")}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-500"
          >
            <Plus size={15} />
            <span className="hidden sm:inline">{t("add")}</span>
          </button>
        </div>

        {/* ── Account filter ── */}
        {transfers.length > 0 && accounts.length > 1 && (
          <>
            {openDropdown && (
              <div className="fixed inset-0 z-30" onClick={() => setOpenDropdown(false)} />
            )}
            <div className="flex items-center gap-2">
              <div className="relative z-40">
                <button
                  onClick={() => setOpenDropdown(!openDropdown)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    filterAccount
                      ? "border-orange-600/60 bg-orange-950/40 text-orange-300"
                      : "border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300"
                  }`}
                >
                  <span className="max-w-[140px] truncate">{filterLabel}</span>
                  <ChevronDown
                    size={10}
                    className={`shrink-0 transition-transform ${openDropdown ? "rotate-180" : ""}`}
                  />
                </button>
                {openDropdown && (
                  <div className="absolute left-0 top-full z-40 mt-1.5 max-h-[55vh] min-w-[160px] overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 py-1 shadow-2xl">
                    <button
                      onClick={() => { setFilterAccount(""); setOpenDropdown(false); }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-slate-800 ${
                        !filterAccount ? "text-orange-300" : "text-slate-300"
                      }`}
                    >
                      {!filterAccount && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />}
                      Tous les comptes
                    </button>
                    {accounts.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => { setFilterAccount(a.id); setOpenDropdown(false); }}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-slate-800 ${
                          filterAccount === a.id ? "text-orange-300" : "text-slate-400"
                        }`}
                      >
                        {filterAccount === a.id && (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                        )}
                        <span className="truncate">{a.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {filterAccount && (
                <button
                  onClick={() => setFilterAccount("")}
                  className="flex items-center gap-1 text-xs text-slate-600 transition-colors hover:text-slate-400"
                >
                  <X size={10} />
                  Réinitialiser
                </button>
              )}
            </div>
          </>
        )}

        {/* ── List ── */}
        {transfers.length === 0 ? (
          <EmptyState message={tc("empty")} />
        ) : filtered.length === 0 ? (
          <EmptyState message="Aucun transfert pour ce compte." />
        ) : (
          <>
            <SectionHeader
              label={`${filtered.length} transfert${filtered.length !== 1 ? "s" : ""}`}
            />
            <Card className="overflow-hidden p-0">
              <ul className="divide-y divide-slate-800/50">
                {filtered.map((tr) => {
                  const from    = accounts.find((a) => a.id === tr.from_account_id);
                  const to      = accounts.find((a) => a.id === tr.to_account_id);
                  const isCross = tr.from_currency !== tr.to_currency;

                  return (
                    <li
                      key={tr.id}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-800/20"
                    >
                      {/* Source → Dest flow */}
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-1.5">
                          {/* From */}
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className="h-2 w-2 shrink-0 rounded-full bg-slate-500/70" />
                            <span className="min-w-0 truncate text-sm font-medium text-slate-200">
                              {from?.name ?? "?"}
                            </span>
                          </div>
                          {/* Arrow */}
                          <ArrowRight
                            size={12}
                            className="mx-0.5 shrink-0 text-orange-500/60"
                          />
                          {/* To */}
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className="h-2 w-2 shrink-0 rounded-full bg-sky-500/60" />
                            <span className="min-w-0 truncate text-sm font-medium text-slate-200">
                              {to?.name ?? "?"}
                            </span>
                          </div>
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-slate-600">
                          {formatDate(tr.transfer_date)}
                          {tr.note && <span className="ml-2 text-slate-700">· {tr.note}</span>}
                        </p>
                      </div>

                      {/* Amounts */}
                      <div className="shrink-0 text-right">
                        <p className="font-mono text-sm font-semibold tabular-nums text-slate-200">
                          {formatMoney(tr.from_amount, tr.from_currency)}
                        </p>
                        {isCross && (
                          <p className="font-mono text-[11px] tabular-nums text-sky-400">
                            → {formatMoney(tr.to_amount, tr.to_currency)}
                          </p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </>
        )}
      </div>

      {/* ── Add transfer modal ────────────────────────────────────────────────── */}
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

            <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto px-5 pb-2">
                <div className="space-y-4 py-1">

                  {/* From account */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
                      {t("from")}
                    </label>
                    <select
                      value={fromId}
                      onChange={(e) => {
                        setFromId(e.target.value);
                        if (e.target.value === toId) setToId("");
                      }}
                      required
                      className={fieldCls}
                    >
                      <option value="">— Sélectionner —</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({a.currency})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* To account */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
                      {t("to")}
                    </label>
                    <select
                      value={toId}
                      onChange={(e) => setToId(e.target.value)}
                      required
                      className={fieldCls}
                    >
                      <option value="">— Sélectionner —</option>
                      {accounts
                        .filter((a) => a.id !== fromId)
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} ({a.currency})
                          </option>
                        ))}
                    </select>
                  </div>

                  {/* Same account warning */}
                  {sameAccount && (
                    <p className="rounded-xl border border-red-800/50 bg-red-950/30 px-3.5 py-2.5 text-xs text-red-400">
                      Les comptes source et destination doivent être différents.
                    </p>
                  )}

                  {/* Flow preview */}
                  {fromAcc && toAcc && !sameAccount && (
                    <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-3.5 py-2.5">
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="h-2 w-2 shrink-0 rounded-full bg-slate-500/70" />
                        <span className="min-w-0 truncate text-xs font-medium text-slate-300">
                          {fromAcc.name}
                        </span>
                      </span>
                      <ArrowRight size={12} className="shrink-0 text-orange-500/60" />
                      <span className="flex items-center gap-1.5 min-w-0">
                        <span className="h-2 w-2 shrink-0 rounded-full bg-sky-500/60" />
                        <span className="min-w-0 truncate text-xs font-medium text-slate-300">
                          {toAcc.name}
                        </span>
                      </span>
                      {!sameCurrency && (
                        <span className="ml-auto shrink-0 rounded-full bg-amber-950/40 px-2 py-0.5 text-[10px] text-amber-400">
                          Multi-devise
                        </span>
                      )}
                    </div>
                  )}

                  {/* From amount */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
                      {t("from_amount")}
                      {fromAcc && (
                        <span className="ml-1 text-slate-600">({fromAcc.currency})</span>
                      )}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={fromAmount}
                      onChange={(e) => handleFromAmountChange(e.target.value)}
                      required
                      placeholder="0.00"
                      className={`${fieldCls} font-mono tabular-nums`}
                    />
                  </div>

                  {/* Exchange rate (cross-currency only) */}
                  {!sameCurrency && fromAcc && toAcc && (
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-400">
                        {t("exchange_rate")}
                        <span className="ml-1 text-slate-600">
                          (1 {fromAcc.currency} = ? {toAcc.currency})
                        </span>
                      </label>
                      <input
                        type="number"
                        step="0.0001"
                        min="0.0001"
                        value={exchangeRate}
                        onChange={(e) => handleRateChange(e.target.value)}
                        required
                        placeholder="1.0000"
                        className={`${fieldCls} font-mono tabular-nums`}
                      />
                    </div>
                  )}

                  {/* To amount */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
                      {t("to_amount")}
                      {toAcc && (
                        <span className="ml-1 text-slate-600">({toAcc.currency})</span>
                      )}
                      {sameCurrency && (
                        <span className="ml-1 text-slate-600">(automatique)</span>
                      )}
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={toAmount}
                      onChange={(e) => setToAmount(e.target.value)}
                      required
                      readOnly={sameCurrency}
                      placeholder="0.00"
                      className={`${fieldCls} font-mono tabular-nums ${
                        sameCurrency ? "opacity-50" : ""
                      }`}
                    />
                  </div>

                  {/* Date */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
                      {t("date")}
                    </label>
                    <input
                      type="date"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
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
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Remarque interne…"
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
                    disabled={!canSave}
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
    </PageWrapper>
  );
}
