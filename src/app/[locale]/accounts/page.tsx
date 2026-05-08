"use client";

import { useState } from "react";
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
import { LoadingPage } from "@/components/ui/LoadingSpinner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { AccountType } from "@/lib/supabase/types";
import { Plus, Pencil, Trash2 } from "lucide-react";

const ACCOUNT_TYPES: AccountType[] = ["personal", "business", "client", "held"];

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

  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("personal");
  const [currency, setCurrency] = useState("USD");
  const [balance, setBalance] = useState("0");
  const [note, setNote] = useState("");

  function openAdd() {
    setEditing(null);
    setName(""); setType("personal"); setCurrency("USD");
    setBalance("0"); setNote("");
    setShowForm(true);
  }

  function openEdit(id: string) {
    const acc = accounts.find((a) => a.id === id);
    if (!acc) return;
    setEditing(id);
    setName(acc.name); setType(acc.type); setCurrency(acc.currency);
    setBalance(String(acc.balance)); setNote(acc.note ?? "");
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (editing) {
      await updateAccount(editing, { name, type, currency, note: note || null });
    } else {
      await addAccount(user.id, name, type, currency, Number(balance), note || null);
    }
    setShowForm(false);
  }

  const typeVariant: Record<AccountType, "default" | "info" | "success" | "warning"> = {
    personal: "default",
    business: "info",
    client: "success",
    held: "warning",
  };

  if (loading) return <PageWrapper locale={locale}><LoadingPage /></PageWrapper>;

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
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate text-base font-semibold text-slate-50">
                        {acc.name}
                      </h3>
                      <Badge variant={typeVariant[acc.type]}>
                        {t(`types.${acc.type}`)}
                      </Badge>
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
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <MoneyAmount
                      amount={acc.balance}
                      currency={acc.currency}
                      className={`text-base font-semibold ${Number(acc.balance) < 0 ? "text-red-400" : "text-slate-50"}`}
                    />
                    <div className="flex gap-1">
                      <button
                        onClick={() => openEdit(acc.id)}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-300"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => setDeleteId(acc.id)}
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

      {/* Form modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-base font-semibold text-slate-50">
              {editing ? tc("edit") : t("add")}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t("name")}</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t("type")}</label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as AccountType)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none"
                >
                  {ACCOUNT_TYPES.map((tp) => (
                    <option key={tp} value={tp}>{t(`types.${tp}`)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t("currency")}</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
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
                    type="number"
                    step="0.01"
                    value={balance}
                    onChange={(e) => setBalance(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none"
                  />
                </div>
              )}
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
