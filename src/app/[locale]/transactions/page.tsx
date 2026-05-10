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
import { TransactionType } from "@/lib/supabase/types";
import { formatDate } from "@/lib/utils";
import { formatMoney, getValidRate, DEFAULT_CURRENCIES } from "@/lib/currency";
import { Plus, Trash2 } from "lucide-react";

const EXPENSE_CATEGORIES = [
  "Alimentation", "Transport", "Logement / Loyer", "Hôtel & Voyage",
  "Santé", "Études / École", "Internet & Téléphone", "Abonnements",
  "Shopping / Achats personnels", "Business / Sourcing", "Marketing",
  "Frais bancaires", "Commission payée", "Salaire payé",
  "Livraison / Transport colis", "Douane / Taxes", "Restaurant / Sorties",
  "Cadeaux / Aide familiale", "Équipement / Matériel", "Urgence", "Autre",
];

const INCOME_CATEGORIES = [
  "Salaire reçu", "Bénéfice business", "Commission reçue", "Paiement client",
  "Remboursement", "Aide familiale", "Don reçu", "Investissement reçu",
  "Vente produit", "Service vendu", "Bonus", "Autre",
];

type DomainType = "all" | "personal" | "business" | "investment" | "debt" | "client" | "other";

const CATEGORY_DOMAIN: Record<string, DomainType> = {
  // Personnel - dépenses
  "Alimentation": "personal",
  "Transport": "personal",
  "Logement / Loyer": "personal",
  "Hôtel & Voyage": "personal",
  "Santé": "personal",
  "Études / École": "personal",
  "Internet & Téléphone": "personal",
  "Abonnements": "personal",
  "Shopping / Achats personnels": "personal",
  "Restaurant / Sorties": "personal",
  "Cadeaux / Aide familiale": "personal",
  "Urgence": "personal",
  // Personnel - revenus
  "Salaire reçu": "personal",
  "Aide familiale": "personal",
  "Don reçu": "personal",
  // Business - dépenses
  "Business / Sourcing": "business",
  "Marketing": "business",
  "Frais bancaires": "business",
  "Commission payée": "business",
  "Salaire payé": "business",
  "Livraison / Transport colis": "business",
  "Douane / Taxes": "business",
  "Équipement / Matériel": "business",
  // Business - revenus
  "Bénéfice business": "business",
  "Commission reçue": "business",
  "Vente produit": "business",
  "Service vendu": "business",
  "Bonus": "business",
  // Investissement
  "Investissement reçu": "investment",
  // Dette / remboursement
  "Remboursement": "debt",
  // Client / commande
  "Paiement client": "client",
  // Autre
  "Autre": "other",
};

const PERSONAL_SUBCATEGORY_MAP: Record<string, string> = {
  "Alimentation": "Nourriture",
  "Restaurant / Sorties": "Loisirs",
  "Transport": "Transport",
  "Logement / Loyer": "Logement",
  "Hôtel & Voyage": "Voyage",
  "Santé": "Santé",
  "Études / École": "Études",
  "Internet & Téléphone": "Abonnements",
  "Abonnements": "Abonnements",
  "Shopping / Achats personnels": "Shopping",
  "Cadeaux / Aide familiale": "Autre",
  "Urgence": "Autre",
  "Salaire reçu": "Salaire",
  "Aide familiale": "Autre",
  "Don reçu": "Autre",
};

const PERSONAL_SUBCATEGORIES = [
  "Tout", "Nourriture", "Transport", "Logement", "Shopping",
  "Santé", "Études", "Abonnements", "Loisirs", "Voyage", "Salaire", "Autre",
];

const DOMAIN_LABELS: Record<DomainType, string> = {
  all: "Tous",
  personal: "Personnel",
  business: "Business",
  investment: "Investissement",
  debt: "Dette",
  client: "Client",
  other: "Autre",
};

const DOMAINS: DomainType[] = ["all", "personal", "business", "investment", "debt", "client", "other"];

const PAGE_SIZE = 20;

const DEFAULT_RATE_MAP: Record<string, number> = Object.fromEntries(
  DEFAULT_CURRENCIES.map((c) => [c.code, c.rate_to_usd])
);

type Props = { params: Promise<{ locale: string }> };

export default function TransactionsPage({ params }: Props) {
  const { locale } = use(params);
  const t = useTranslations("transactions");
  const tc = useTranslations("common");
  const { transactions, loading: txLoading, addTransaction, deleteTransaction } = useTransactions();
  const { accounts, loading: accLoading } = useAccounts();
  const { ratesByCode } = useCurrencies();

  const [showForm, setShowForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string; accountId: string; type: TransactionType; amount: number;
  } | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Filters
  const [filterType, setFilterType] = useState<"" | "income" | "expense">("");
  const [filterAccount, setFilterAccount] = useState("");
  const [filterDomain, setFilterDomain] = useState<DomainType>("all");
  const [filterSubcategory, setFilterSubcategory] = useState("Tout");

  // Form state
  const [txType, setTxType] = useState<TransactionType>("expense");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [category, setCategory] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);

  const resolveRate = useCallback((currency: string): number => {
    return getValidRate(ratesByCode[currency]) ?? DEFAULT_RATE_MAP[currency] ?? 1;
  }, [ratesByCode]);

  const filtered = useMemo(
    () => transactions.filter((tx) => {
      if (filterType && tx.type !== filterType) return false;
      if (filterAccount && tx.account_id !== filterAccount) return false;
      if (filterDomain !== "all") {
        const domain = tx.category ? (CATEGORY_DOMAIN[tx.category] ?? "other") : "other";
        if (domain !== filterDomain) return false;
      }
      if (filterDomain === "personal" && filterSubcategory !== "Tout") {
        const sub = tx.category ? (PERSONAL_SUBCATEGORY_MAP[tx.category] ?? "Autre") : "Autre";
        if (sub !== filterSubcategory) return false;
      }
      return true;
    }),
    [transactions, filterType, filterAccount, filterDomain, filterSubcategory]
  );

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const tx of filtered) {
      const usd = Number(tx.amount) * resolveRate(tx.currency);
      if (tx.type === "income") income += usd;
      else expense += usd;
    }
    return { income, expense, net: income - expense };
  }, [filtered, resolveRate]);

  const visible = useMemo(
    () => (showAll ? filtered : filtered.slice(0, PAGE_SIZE)),
    [filtered, showAll]
  );

  function openForm() {
    setAccountId(accounts[0]?.id ?? "");
    setTxType("expense");
    setCategory("");
    setAmount("");
    setNote("");
    setDate(new Date().toISOString().split("T")[0]);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !accountId) return;
    const acc = accounts.find((a) => a.id === accountId);
    await addTransaction(
      user.id, accountId, txType, Number(amount),
      acc?.currency ?? "USD", category || null, note || null, date
    );
    setShowForm(false);
    setAmount(""); setNote(""); setCategory("");
  }

  function handleDomainChange(domain: DomainType) {
    setFilterDomain(domain);
    setFilterSubcategory("Tout");
    setShowAll(false);
  }

  const formCategories = txType === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;

  if (txLoading || accLoading) return (
    <PageWrapper locale={locale}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="h-7 w-32 animate-pulse rounded-lg bg-slate-800" />
          <div className="h-9 w-44 animate-pulse rounded-lg bg-slate-800" />
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {[60, 70, 80, 90, 60, 70, 60].map((w, i) => (
            <div key={i} style={{ width: `${w}px`, flexShrink: 0 }} className="h-8 animate-pulse rounded-full bg-slate-800" />
          ))}
        </div>
        <SkeletonList count={5} />
      </div>
    </PageWrapper>
  );

  return (
    <PageWrapper locale={locale}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-bold text-slate-50">{t("title")}</h1>
          <button
            onClick={openForm}
            className="flex items-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700"
          >
            <Plus size={15} />
            {t("add")}
          </button>
        </div>

        {/* Domain filter pills */}
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {DOMAINS.map((domain) => (
            <button
              key={domain}
              onClick={() => handleDomainChange(domain)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                filterDomain === domain
                  ? "bg-orange-600 text-white"
                  : "border border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200"
              }`}
            >
              {DOMAIN_LABELS[domain]}
            </button>
          ))}
        </div>

        {/* Subcategory pills — only for Personal */}
        {filterDomain === "personal" && (
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {PERSONAL_SUBCATEGORIES.map((sub) => (
              <button
                key={sub}
                onClick={() => { setFilterSubcategory(sub); setShowAll(false); }}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  filterSubcategory === sub
                    ? "bg-slate-200 text-slate-900"
                    : "border border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300"
                }`}
              >
                {sub}
              </button>
            ))}
          </div>
        )}

        {/* Type + account dropdowns */}
        <div className="flex flex-wrap gap-2">
          <select
            value={filterType}
            onChange={(e) => { setFilterType(e.target.value as "" | "income" | "expense"); setShowAll(false); }}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 focus:border-orange-500 focus:outline-none"
          >
            <option value="">{t("filters.all_types")}</option>
            <option value="income">{t("income")}</option>
            <option value="expense">{t("expense")}</option>
          </select>
          <select
            value={filterAccount}
            onChange={(e) => { setFilterAccount(e.target.value); setShowAll(false); }}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 focus:border-orange-500 focus:outline-none"
          >
            <option value="">{t("filters.all_accounts")}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        {/* Summary totals */}
        {filtered.length > 0 && (
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
              <p className="mb-1 text-xs text-slate-500">{t("income")}</p>
              <p className="font-mono text-sm font-semibold text-emerald-400 tabular-nums">
                +{formatMoney(totals.income, "USD")}
              </p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
              <p className="mb-1 text-xs text-slate-500">{t("expense")}</p>
              <p className="font-mono text-sm font-semibold text-red-400 tabular-nums">
                -{formatMoney(totals.expense, "USD")}
              </p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3">
              <p className="mb-1 text-xs text-slate-500">Net</p>
              <p className={`font-mono text-sm font-semibold tabular-nums ${totals.net >= 0 ? "text-slate-100" : "text-red-400"}`}>
                {totals.net >= 0 ? "+" : ""}{formatMoney(Math.abs(totals.net), "USD")}
              </p>
            </div>
          </div>
        )}

        {filtered.length === 0 ? (
          <EmptyState message={tc("empty")} />
        ) : (
          <div className="space-y-2">
            {visible.map((tx) => {
              const acc = accounts.find((a) => a.id === tx.account_id);
              return (
                <Card key={tx.id}>
                  <article className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={tx.type === "income" ? "success" : "danger"}>
                          {tx.type === "income" ? t("income") : t("expense")}
                        </Badge>
                        {tx.category && (
                          <span className="truncate text-sm text-slate-300">{tx.category}</span>
                        )}
                      </div>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {acc?.name ?? "—"} · {formatDate(tx.transaction_date)}
                      </p>
                      {tx.note && (
                        <p className="mt-0.5 truncate text-xs text-slate-600">{tx.note}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <MoneyAmount
                        amount={tx.amount}
                        currency={tx.currency}
                        className={`text-sm font-semibold tabular-nums ${tx.type === "expense" ? "text-red-400" : "text-emerald-400"}`}
                      />
                      <button
                        onClick={() => setDeleteTarget({
                          id: tx.id, accountId: tx.account_id, type: tx.type, amount: tx.amount,
                        })}
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

      {/* Add transaction modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-base font-semibold text-slate-50">{t("add")}</h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t("type")}</label>
                <div className="flex gap-2">
                  {(["expense", "income"] as TransactionType[]).map((tp) => (
                    <button
                      key={tp}
                      type="button"
                      onClick={() => { setTxType(tp); setCategory(""); }}
                      className={`flex-1 rounded-lg py-2 text-sm font-medium transition ${
                        txType === tp
                          ? tp === "income" ? "bg-emerald-700 text-white" : "bg-red-700 text-white"
                          : "border border-slate-700 text-slate-400 hover:bg-slate-800"
                      }`}
                    >
                      {tp === "income" ? t("income") : t("expense")}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t("account")}</label>
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
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
                <label className="mb-1 block text-xs text-slate-400">{t("amount")}</label>
                <input
                  type="number" step="0.01" min="0.01" value={amount}
                  onChange={(e) => setAmount(e.target.value)} required
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t("category")}</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none"
                >
                  <option value="">—</option>
                  {formCategories.map((c) => (
                    <option key={`${txType}-${c}`} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t("date")}</label>
                <input
                  type="date" value={date}
                  onChange={(e) => setDate(e.target.value)} required
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none"
                />
              </div>
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
        open={!!deleteTarget}
        title={tc("confirm_delete")}
        message="Supprimer cette transaction ?"
        confirmLabel={tc("delete")}
        cancelLabel={tc("cancel")}
        danger
        onConfirm={async () => {
          if (deleteTarget) {
            await deleteTransaction(
              deleteTarget.id, deleteTarget.accountId, deleteTarget.type, deleteTarget.amount
            );
          }
          setDeleteTarget(null);
        }}
        onCancel={() => setDeleteTarget(null)}
      />
    </PageWrapper>
  );
}
