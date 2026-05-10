"use client";

import { useState, useMemo } from "react";
import { use } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useAccounts } from "@/hooks/useAccounts";
import { useCurrencies } from "@/hooks/useCurrencies";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Card } from "@/components/ui/Card";
import { MoneyAmount } from "@/components/ui/MoneyAmount";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Account, AccountType, AccountAvailability, Transaction } from "@/lib/supabase/types";
import { formatDate } from "@/lib/utils";
import { formatMoney } from "@/lib/currency";
import { Plus, Pencil, Trash2, X, TrendingUp, TrendingDown } from "lucide-react";

const ACCOUNT_TYPES: AccountType[] = [
  "personal", "business", "client", "savings", "investment",
  "emergency", "school", "debt", "held", "other",
];

const AVAILABILITY_OPTIONS: AccountAvailability[] = [
  "immediate", "close", "distant", "blocked",
];

const LEGACY_TYPE_MAP: Partial<Record<string, AccountType>> = {
  personnel: "personal",
  professionnel: "business",
  epargne: "savings",
  investissement: "investment",
  ecole: "school",
  risque: "emergency",
};

const TYPE_LABELS: Record<string, string> = {
  personal: "Personnel",    personnel: "Personnel",
  business: "Business",     professionnel: "Professionnel",
  client: "Client",
  savings: "Épargne",       epargne: "Épargne",
  investment: "Investissement", investissement: "Investissement",
  emergency: "Urgence",
  school: "École",          ecole: "École",
  debt: "Dette",
  held: "Argent gardé",
  other: "Autre",
  risque: "Risque",
};

const TYPE_VARIANT: Record<string, "default" | "info" | "success" | "warning" | "danger"> = {
  personal: "default",    personnel: "default",
  business: "info",       professionnel: "info",
  client: "success",
  savings: "success",     epargne: "success",
  investment: "warning",  investissement: "warning",
  emergency: "danger",
  school: "info",         ecole: "info",
  debt: "danger",
  held: "warning",
  other: "default",
  risque: "danger",
};

const AVAIL_LABELS: Record<AccountAvailability, string> = {
  immediate: "Disponible",
  close: "Proche",
  distant: "Éloigné",
  blocked: "Bloqué",
};

const AVAIL_VARIANT: Record<AccountAvailability, "success" | "warning" | "danger" | "default"> = {
  immediate: "success",
  close: "warning",
  distant: "warning",
  blocked: "danger",
};

type Props = { params: Promise<{ locale: string }> };

export default function AccountsPage({ params }: Props) {
  const { locale } = use(params);
  const t = useTranslations("accounts");
  const tc = useTranslations("common");
  const { accounts, loading, addAccount, updateAccount, deleteAccount } = useAccounts();
  const { currencies } = useCurrencies();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Detail panel state
  const [detailAccount, setDetailAccount] = useState<Account | null>(null);
  const [detailTxs, setDetailTxs] = useState<Transaction[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("personal");
  const [currency, setCurrency] = useState("USD");
  const [balance, setBalance] = useState("0");
  const [note, setNote] = useState("");
  const [availability, setAvailability] = useState<AccountAvailability>("immediate");

  async function openDetail(acc: Account) {
    setDetailAccount(acc);
    setDetailLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("transactions")
      .select("*")
      .eq("account_id", acc.id)
      .order("transaction_date", { ascending: false })
      .limit(30);
    setDetailTxs(data ?? []);
    setDetailLoading(false);
  }

  function closeDetail() {
    setDetailAccount(null);
    setDetailTxs([]);
  }

  function openAdd() {
    setEditing(null);
    setName(""); setType("personal"); setCurrency("USD");
    setBalance("0"); setNote(""); setAvailability("immediate");
    setShowForm(true);
  }

  function openEdit(id: string) {
    const acc = accounts.find((a) => a.id === id);
    if (!acc) return;
    setEditing(id);
    setName(acc.name);
    setType(LEGACY_TYPE_MAP[acc.type] ?? acc.type);
    setCurrency(acc.currency);
    setBalance(String(acc.balance));
    setNote(acc.note ?? "");
    setAvailability(acc.availability ?? "immediate");
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    if (editing) {
      await updateAccount(editing, { name, type, currency, note: note || null, availability });
    } else {
      await addAccount(user.id, name, type, currency, Number(balance), note || null, availability);
    }
    setShowForm(false);
  }

  // Monthly summary from detailTxs
  const monthlySummary = useMemo(() => {
    if (!detailAccount || detailTxs.length === 0) return null;
    const now = new Date();
    const thisMonth = now.getMonth();
    const thisYear = now.getFullYear();
    const monthTxs = detailTxs.filter((tx) => {
      const d = new Date(tx.transaction_date);
      return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
    });
    if (monthTxs.length === 0) return null;
    const income = monthTxs.filter((tx) => tx.type === "income").reduce((s, tx) => s + Number(tx.amount), 0);
    const expense = monthTxs.filter((tx) => tx.type === "expense").reduce((s, tx) => s + Number(tx.amount), 0);
    return { income, expense, net: income - expense };
  }, [detailAccount, detailTxs]);

  if (loading) return (
    <PageWrapper locale={locale}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="h-7 w-24 animate-pulse rounded-lg bg-slate-800" />
          <div className="h-9 w-36 animate-pulse rounded-lg bg-slate-800" />
        </div>
        <SkeletonList count={3} />
      </div>
    </PageWrapper>
  );

  return (
    <PageWrapper locale={locale}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-bold text-slate-50">{t("title")}</h1>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700"
          >
            <Plus size={15} />
            {t("add")}
          </button>
        </div>

        {accounts.length === 0 ? (
          <EmptyState message={tc("empty")} />
        ) : (
          <div className="space-y-2">
            {accounts.map((acc) => (
              <Card key={acc.id}>
                <article className="flex items-start justify-between gap-4">
                  {/* Clickable main area → opens detail */}
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() => openDetail(acc)}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="truncate text-base font-semibold text-slate-50">
                        {acc.name}
                      </h3>
                      <Badge variant={TYPE_VARIANT[acc.type] ?? "default"}>
                        {TYPE_LABELS[acc.type] ?? acc.type}
                      </Badge>
                      {acc.availability && (
                        <Badge variant={AVAIL_VARIANT[acc.availability]}>
                          {AVAIL_LABELS[acc.availability]}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{acc.currency}</p>
                    {acc.note && (
                      <p className="mt-1 truncate text-xs text-slate-500">{acc.note}</p>
                    )}
                    {Number(acc.balance) < 0 && (
                      <Badge variant="danger" className="mt-1">
                        {t("negative_warning")}
                      </Badge>
                    )}
                  </button>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <MoneyAmount
                      amount={acc.balance}
                      currency={acc.currency}
                      className={`font-mono tabular-nums text-base font-semibold ${Number(acc.balance) < 0 ? "text-red-400" : "text-slate-50"}`}
                    />
                    <div className="flex gap-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); openEdit(acc.id); }}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-300"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteId(acc.id); }}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-red-400"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </article>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Account detail panel */}
      {detailAccount && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 md:items-center">
          <div className="w-full max-w-md overflow-y-auto rounded-t-2xl border border-slate-800 bg-slate-900 p-6 md:rounded-xl" style={{ maxHeight: "90vh" }}>
            {/* Header */}
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-50">{detailAccount.name}</h2>
                <p className="text-xs text-slate-500">
                  {detailAccount.currency} · {TYPE_LABELS[detailAccount.type] ?? detailAccount.type}
                  {detailAccount.availability ? ` · ${AVAIL_LABELS[detailAccount.availability]}` : ""}
                </p>
              </div>
              <button
                onClick={closeDetail}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-300"
              >
                <X size={16} />
              </button>
            </div>

            {/* Balance */}
            <div className="mb-4 rounded-xl bg-slate-800 p-4">
              <p className="mb-1 text-xs text-slate-400">Solde actuel</p>
              <p className={`font-mono text-2xl font-bold tabular-nums ${Number(detailAccount.balance) < 0 ? "text-red-400" : "text-slate-50"}`}>
                {formatMoney(detailAccount.balance, detailAccount.currency)}
              </p>
            </div>

            {/* Monthly summary */}
            {monthlySummary && (
              <div className="mb-4">
                <p className="mb-2 text-xs font-medium text-slate-400">Ce mois-ci</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg bg-slate-800/60 p-2.5">
                    <div className="mb-1 flex items-center gap-1">
                      <TrendingUp size={10} className="text-emerald-500" />
                      <p className="text-xs text-slate-500">Entrées</p>
                    </div>
                    <p className="font-mono text-sm font-semibold text-emerald-400 tabular-nums">
                      +{formatMoney(monthlySummary.income, detailAccount.currency)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-800/60 p-2.5">
                    <div className="mb-1 flex items-center gap-1">
                      <TrendingDown size={10} className="text-red-500" />
                      <p className="text-xs text-slate-500">Sorties</p>
                    </div>
                    <p className="font-mono text-sm font-semibold text-red-400 tabular-nums">
                      -{formatMoney(monthlySummary.expense, detailAccount.currency)}
                    </p>
                  </div>
                  <div className="rounded-lg bg-slate-800/60 p-2.5">
                    <p className="mb-1 text-xs text-slate-500">Net</p>
                    <p className={`font-mono text-sm font-semibold tabular-nums ${monthlySummary.net >= 0 ? "text-slate-100" : "text-red-400"}`}>
                      {monthlySummary.net >= 0 ? "+" : ""}{formatMoney(Math.abs(monthlySummary.net), detailAccount.currency)}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Recent transactions */}
            <div>
              <p className="mb-2 text-xs font-medium text-slate-400">Dernières opérations</p>
              {detailLoading ? (
                <div className="space-y-2">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-800" />
                  ))}
                </div>
              ) : detailTxs.length === 0 ? (
                <p className="text-sm text-slate-600">Aucune opération enregistrée</p>
              ) : (
                <ul className="divide-y divide-slate-800">
                  {detailTxs.slice(0, 5).map((tx) => (
                    <li key={tx.id} className="flex items-center justify-between gap-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-slate-300">
                          {tx.category ?? tx.note ?? "—"}
                        </p>
                        <p className="text-xs text-slate-600">{formatDate(tx.transaction_date)}</p>
                      </div>
                      <p className={`shrink-0 font-mono text-sm font-medium tabular-nums ${tx.type === "expense" ? "text-red-400" : "text-emerald-400"}`}>
                        {tx.type === "expense" ? "-" : "+"}{formatMoney(tx.amount, tx.currency)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add/edit form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 md:items-center md:p-4">
          <div className="w-full max-w-sm rounded-t-2xl border border-slate-800 bg-slate-900 p-6 md:rounded-xl">
            <h2 className="mb-4 text-base font-semibold text-slate-50">
              {editing ? tc("edit") : t("add")}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t("name")}</label>
                <input
                  value={name} onChange={(e) => setName(e.target.value)} required
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t("type")}</label>
                <select
                  value={type} onChange={(e) => setType(e.target.value as AccountType)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none"
                >
                  {ACCOUNT_TYPES.map((tp) => (
                    <option key={tp} value={tp}>{TYPE_LABELS[tp]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t("availability")}</label>
                <select
                  value={availability} onChange={(e) => setAvailability(e.target.value as AccountAvailability)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none"
                >
                  {AVAILABILITY_OPTIONS.map((av) => (
                    <option key={av} value={av}>{t(`availabilities.${av}`)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t("currency")}</label>
                <select
                  value={currency} onChange={(e) => setCurrency(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none"
                >
                  {currencies.map((c) => (
                    <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                  ))}
                </select>
              </div>
              {!editing && (
                <div>
                  <label className="mb-1 block text-xs text-slate-400">{t("balance")}</label>
                  <input
                    type="number" step="0.01" value={balance}
                    onChange={(e) => setBalance(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none"
                  />
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t("note")}</label>
                <input
                  value={note} onChange={(e) => setNote(e.target.value)}
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

      <ConfirmDialog
        open={!!deleteId}
        title={tc("confirm_delete")}
        message="Supprimer ce compte ?"
        confirmLabel={tc("delete")}
        cancelLabel={tc("cancel")}
        danger
        onConfirm={async () => {
          if (deleteId) await deleteAccount(deleteId);
          setDeleteId(null);
        }}
        onCancel={() => setDeleteId(null)}
      />
    </PageWrapper>
  );
}
