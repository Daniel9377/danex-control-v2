"use client";

// Force dynamic rendering — account balances change frequently and must
// never be served from the Next.js SSR cache (e.g. after debt payments).
export const dynamic = "force-dynamic";

import { useState, useMemo, useRef } from "react";
import { use } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAccounts } from "@/hooks/useAccounts";
import { useCurrencies } from "@/hooks/useCurrencies";
import { useTransactions } from "@/hooks/useTransactions";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Sparkline } from "@/components/charts/Sparkline";
import { Account, AccountType, AccountAvailability } from "@/lib/supabase/types";
import { formatMoney } from "@/lib/currency";
import { computeAccountClientMoney } from "@/lib/financial-calculations";
import {
  Plus, Pencil, Trash2, X, AlertTriangle, MoreHorizontal,
  Wallet, Briefcase, Users, PiggyBank, TrendingUp, Shield,
  GraduationCap, CreditCard, Hand, CircleDollarSign, ChevronDown,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { LoadingPage } from "@/components/ui/LoadingSpinner";

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

const TYPE_VARIANT: Record<string, "default" | "info" | "success" | "warning" | "danger"> = {
  personal: "default",    personnel: "default",
  business: "info",       professionnel: "info",
  client: "success",
  savings: "success",     epargne: "success",
  investment: "warning",  investissement: "warning",
  emergency: "danger",
  debt: "danger",
  school: "info",        ecole: "info",
  held: "default",
  other: "default",
};

const ACCOUNT_ICONS: Record<string, LucideIcon> = {
  personal: Wallet,
  business: Briefcase,
  client: Users,
  savings: PiggyBank,
  investment: TrendingUp,
  emergency: Shield,
  school: GraduationCap,
  debt: CreditCard,
  held: Hand,
  other: CircleDollarSign,
};

/** Resolves the icon for an account, using its name as a fallback hint. */
function accountIcon(acc: Pick<Account, "type" | "name">): LucideIcon {
  // Name-based overrides for well-known platforms
  const n = acc.name.toLowerCase();
  if (n.includes("alipay") || n.includes("wechat") || n.includes("微信")) return Wallet;   // mobile wallet
  if (n.includes("bank") || n.includes("boc") || n.includes("icbc") || n.includes("banque")) return PiggyBank;
  if (n.includes("cash") || n.includes("liquide") || n.includes("espèce") || n.includes("espece")) return CreditCard;
  if (n.includes("mercury")) return Briefcase;  // business account
  return ACCOUNT_ICONS[acc.type] ?? CircleDollarSign;
}

type Props = { params: Promise<{ locale: string }> };

export default function AccountsPage({ params }: Props) {
  const { locale } = use(params);
  const t = useTranslations("accounts");
  const tc = useTranslations("common");

  const typeLabels = useMemo((): Record<string, string> => ({
    personal: t("types.personal"),
    business: t("types.business"),
    client: t("types.client"),
    savings: t("types.savings"),
    investment: t("types.investment"),
    emergency: t("types.emergency"),
    school: t("types.school"),
    debt: t("types.debt"),
    held: t("types.held"),
    other: t("types.other"),
    personnel: t("types.personnel"),
    professionnel: t("types.professionnel"),
    epargne: t("types.epargne"),
    investissement: t("types.investissement"),
    ecole: t("types.ecole"),
    risque: t("types.risque"),
  }), [t]);

  const availLabels = useMemo((): Record<string, string> => ({
    immediate: t("availabilities.immediate"),
    close: t("availabilities.close"),
    distant: t("availabilities.distant"),
    blocked: t("availabilities.blocked"),
  }), [t]);

  const { accounts, loading, addAccount, updateAccount, deleteAccount } = useAccounts();
  const { currencies, ratesByCode } = useCurrencies();
  const { transactions } = useTransactions();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [availFilter, setAvailFilter] = useState<AccountAvailability | "all">("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("personal");
  const [currency, setCurrency] = useState("USD");
  const [balance, setBalance] = useState("0");
  const [note, setNote] = useState("");
  const [availability, setAvailability] = useState<AccountAvailability>("immediate");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const savingRef = useRef(false);

  // Per-account blocked amount (client money held) — same computation as Dashboard
  const blockedByAccount = useMemo(() => {
    const map: Record<string, number> = {};
    for (const acc of accounts) {
      map[acc.id] = computeAccountClientMoney(transactions, acc.id, ratesByCode).blocked;
    }
    return map;
  }, [accounts, transactions, ratesByCode]);

  // Per-account sparkline data — last 30 daily balance deltas, normalized for SVG
  const sparkByAccount = useMemo(() => {
    const map: Record<string, number[]> = {};
    for (const acc of accounts) {
      const txs = transactions
        .filter((t) => t.account_id === acc.id)
        .sort((a, b) => new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime());
      if (txs.length < 2) { map[acc.id] = []; continue; }
      const values: number[] = [];
      let running = 0;
      for (const tx of txs) {
        running += tx.type === "income" ? Number(tx.amount) : -Number(tx.amount);
        values.push(running);
      }
      map[acc.id] = values;
    }
    return map;
  }, [accounts, transactions]);

  function blockedInCurrency(acc: Account): number {
    const blockedUSD = blockedByAccount[acc.id] ?? 0;
    const rate = Number(ratesByCode[acc.currency] ?? 1);
    return rate > 0 ? blockedUSD / rate : 0;
  }

  const filteredAccounts = useMemo(() => {
    if (availFilter === "all") return accounts;
    return accounts.filter((a) => (a.availability ?? "immediate") === availFilter);
  }, [accounts, availFilter]);

  const byAvail = useMemo(() => {
    const map: Record<string, number> = {};
    accounts.forEach((a) => {
      const k = a.availability ?? "immediate";
      map[k] = (map[k] ?? 0) + 1;
    });
    return map;
  }, [accounts]);

  function openAdd() {
    setEditing(null);
    setName(""); setType("personal"); setCurrency("USD");
    setBalance("0"); setNote(""); setAvailability("immediate");
    setSaving(false); setFormError(null);
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
    setSaving(false); setFormError(null);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setFormError(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setFormError("Session expirée. Reconnecte-toi."); return; }
      const user = session.user;
      if (editing) {
        await updateAccount(editing, { name, type, currency, note: note || null, availability });
      } else {
        await addAccount(user.id, name, type, currency, Number(balance), note || null, availability);
      }
      setShowForm(false);
    } catch {
      setFormError("Une erreur est survenue. Réessaie.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  // ── Loading ───────────────────────────────────────────────────────────────────

  if (loading) return <PageWrapper locale={locale}><LoadingPage /></PageWrapper>;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <PageWrapper locale={locale}>
      <div className="space-y-4">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-50">{t("title")}</h1>
            {accounts.length > 0 && (
              <p className="mt-0.5 text-xs text-slate-500">
                {accounts.length} compte{accounts.length !== 1 ? "s" : ""}
                {byAvail.immediate ? ` · ${byAvail.immediate} disponible${byAvail.immediate > 1 ? "s" : ""}` : ""}
                {byAvail.close ? ` · ${byAvail.close} proche${byAvail.close > 1 ? "s" : ""}` : ""}
                {byAvail.distant ? ` · ${byAvail.distant} éloigné${byAvail.distant > 1 ? "s" : ""}` : ""}
                {byAvail.blocked ? ` · ${byAvail.blocked} bloqué${byAvail.blocked > 1 ? "s" : ""}` : ""}
              </p>
            )}
          </div>
          <button
            onClick={openAdd}
            aria-label={t("add")}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-orange-500"
          >
            <Plus size={15} />
            <span className="hidden sm:inline">{t("add")}</span>
          </button>
        </div>

        {/* ── Availability filters ── */}
        {accounts.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setAvailFilter("all")}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                availFilter === "all"
                  ? "border-orange-600/60 bg-orange-950/40 text-orange-300"
                  : "border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300"
              }`}
            >
              Tous {accounts.length}
            </button>
            {(["immediate", "close", "distant", "blocked"] as AccountAvailability[]).map((av) => {
              const count = accounts.filter((a) => (a.availability ?? "immediate") === av).length;
              if (count === 0) return null;
              return (
                <button
                  key={av}
                  onClick={() => setAvailFilter(av)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    availFilter === av
                      ? av === "immediate" ? "border-emerald-600/60 bg-emerald-950/40 text-emerald-300"
                      : av === "close" ? "border-amber-600/60 bg-amber-950/40 text-amber-300"
                      : av === "distant" ? "border-amber-700/60 bg-amber-950/30 text-amber-400"
                      : "border-slate-600/60 bg-slate-800/40 text-slate-300"
                      : "border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300"
                  }`}
                >
                  {availLabels[av]} {count}
                </button>
              );
            })}
          </div>
        )}

        {/* Menu backdrop */}
        {menuOpenId && (
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpenId(null)} />
        )}

        {/* ── Account grid ─────────────────────────────────────────── */}
        {filteredAccounts.length === 0 ? (
          availFilter !== "all" ? (
            <EmptyState message="Aucun compte avec ce filtre." />
          ) : (
            <EmptyState message={tc("empty")} />
          )
        ) : (
          <>
            {filteredAccounts.length > 0 && (
              <SectionHeader label={`${filteredAccounts.length} compte${filteredAccounts.length > 1 ? "s" : ""}`} />
            )}
            <div className="grid grid-cols-1 gap-3">
              {filteredAccounts.map((acc) => {
                const isNeg = Number(acc.balance) < 0;
                const isOpen = expandedId === acc.id;
                const blocked = blockedInCurrency(acc);
                const available = Math.max(0, Number(acc.balance) - blocked);
                const hasBlocked = blocked > 0.001;
                const isMenuOpen = menuOpenId === acc.id;
                return (
                  <article key={acc.id} className={`rounded-xl border transition-colors ${
                    isOpen ? "border-slate-600 bg-slate-900/80" : "border-slate-800 bg-slate-900 hover:border-slate-700"
                  } overflow-hidden`}>
                    {/* Collapsed card — click to expand */}
                    <button
                      onClick={() => setExpandedId(isOpen ? null : acc.id)}
                      className="flex w-full items-center gap-3 p-4 text-left"
                      aria-label={acc.name}
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-700/60 bg-slate-800 text-slate-400">
                        {(() => { const Icon = accountIcon(acc); return <Icon size={18} />; })()}
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-200">{acc.name}</p>
                        <p className="mt-0.5 text-[11px] text-slate-500">
                          {typeLabels[acc.type] ?? acc.type} · {acc.currency}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-3">
                        {/* Fixed-width container — keeps balance + chevron aligned across all cards */}
                        <span className="hidden w-[76px] shrink-0 sm:inline-flex">
                          {sparkByAccount[acc.id]?.length > 1 && (
                            <Sparkline values={sparkByAccount[acc.id]} />
                          )}
                        </span>
                        <div className="w-[100px] shrink-0 text-right">
                          <p className={`truncate font-mono text-lg font-bold tabular-nums ${isNeg ? "text-red-400" : "text-slate-50"}`}>
                            {formatMoney(acc.balance, acc.currency)}
                          </p>
                        </div>
                      </div>

                      <ChevronDown size={18} className={`shrink-0 text-slate-600 transition-transform ${isOpen ? "rotate-180" : ""}`} />

                      {/* "..." menu — stop click propagation so it doesn't toggle expand */}
                      <div className="z-20 shrink-0" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => setMenuOpenId(isMenuOpen ? null : acc.id)}
                          aria-label="Options du compte"
                          className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-slate-800 hover:text-slate-300"
                        >
                          <MoreHorizontal size={14} />
                        </button>
                        {isMenuOpen && (
                          <div className="absolute right-0 top-full z-30 mt-1 w-36 rounded-xl border border-slate-700 bg-slate-900 py-1 shadow-xl">
                            <button
                              onClick={() => { openEdit(acc.id); setMenuOpenId(null); }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-300 hover:bg-slate-700"
                            >
                              <Pencil size={11} /> Modifier
                            </button>
                            <button
                              onClick={() => { setDeleteId(acc.id); setMenuOpenId(null); }}
                              className="flex w-full items-center gap-2 px-3 py-2 text-xs text-red-400 hover:bg-slate-700"
                            >
                              <Trash2 size={11} /> Supprimer
                            </button>
                          </div>
                        )}
                      </div>
                    </button>

                    {/* Expanded detail: Liquidité + Disponible/Bloqué */}
                    {isOpen && (
                      <div className="border-t border-slate-800 bg-slate-900/50 px-4 pb-4 pt-3">
                        {hasBlocked ? (
                          <>
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">Liquidité</p>
                            <div className="flex items-stretch gap-4 rounded-xl border border-slate-800 bg-slate-900/80 p-3">
                              <div className="flex flex-1 flex-col gap-1">
                                <p className="text-[10px] text-slate-500">Disponible</p>
                                <p className="font-mono text-base font-bold tabular-nums text-emerald-400">
                                  {formatMoney(available, acc.currency)}
                                </p>
                              </div>
                              <span className="w-px self-stretch bg-slate-700/60" />
                              <div className="flex flex-1 flex-col gap-1">
                                <p className="text-[10px] text-slate-500">Bloqué</p>
                                <p className="font-mono text-base font-bold tabular-nums text-slate-300">
                                  {formatMoney(blocked, acc.currency)}
                                </p>
                              </div>
                            </div>
                          </>
                        ) : (
                          <p className="text-[11px] text-slate-600">Aucun argent client détenu sur ce compte.</p>
                        )}

                        {/* Meta: availability + note + negative warning */}
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            acc.availability === "immediate" ? "bg-emerald-950/60 text-emerald-400"
                            : acc.availability === "close" ? "bg-amber-950/60 text-amber-400"
                            : acc.availability === "distant" ? "bg-amber-950/40 text-amber-500"
                            : "bg-slate-800 text-slate-500"
                          }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${
                              acc.availability === "immediate" ? "bg-emerald-500"
                              : acc.availability === "close" ? "bg-amber-500"
                              : acc.availability === "distant" ? "bg-amber-600"
                              : "bg-slate-600"
                            }`} />
                            {availLabels[acc.availability ?? "immediate"]}
                          </span>
                          {acc.note && <span className="truncate text-[10px] text-slate-600">— {acc.note}</span>}
                          {isNeg && <span className="flex items-center gap-1 text-[10px] text-red-400"><AlertTriangle size={10} />{t("negative_warning")}</span>}
                        </div>

                        {/* Quick actions */}
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={() => { setExpandedId(null); openEdit(acc.id); }}
                            className="flex items-center gap-1.5 rounded-lg border border-slate-700 px-3 py-1.5 text-[11px] text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
                          >
                            <Pencil size={11} /> Modifier
                          </button>
                          <Link
                            href={`/${locale}/transactions?account=${acc.id}`}
                            className="flex items-center gap-1.5 rounded-lg border border-slate-800 px-3 py-1.5 text-[11px] text-slate-500 transition-colors hover:border-slate-700 hover:text-slate-300"
                          >
                            Voir les transactions →
                          </Link>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </>
        )}

        {/* ── Confirm delete ── */}
        <ConfirmDialog
          open={!!deleteId}
          title={tc("confirm_delete")}
          message={
            deleteError
              ? `Erreur : ${deleteError}`
              : t("delete_confirm")
          }
          confirmLabel={tc("delete")}
          cancelLabel={tc("cancel")}
          danger
          onConfirm={async () => {
            if (!deleteId) return;
            try {
              await deleteAccount(deleteId);
              setDeleteId(null);
              setDeleteError(null);
            } catch (err: unknown) {
              setDeleteError(err instanceof Error ? err.message : "Échec de la suppression.");
            }
          }}
          onCancel={() => setDeleteId(null)}
        />

        {/* ── New / Edit form modal ── */}
        {showForm && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm md:items-center"
            onClick={() => setShowForm(false)}
          >
            <div
              className="flex max-h-[92vh] w-full max-w-md flex-col rounded-t-2xl border border-slate-800 bg-slate-950 shadow-2xl md:rounded-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center pt-2.5 md:hidden">
                <div className="h-1 w-10 rounded-full bg-slate-700" />
              </div>

              <div className="flex items-start justify-between gap-3 px-5 pb-3 pt-4">
                <div>
                  <h2 className="text-base font-bold text-slate-50">
                    {editing ? "Modifier le compte" : "Nouveau compte"}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {editing
                      ? "Modifie les informations de ce compte."
                      : "Ajoute un endroit où ton argent est stocké."}
                  </p>
                </div>
                <button
                  onClick={() => setShowForm(false)}
                  className="shrink-0 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
                <div className="flex-1 overflow-y-auto px-5 pb-2">
                  <div className="space-y-5 py-1">

                    {/* Section 1 : Identité */}
                    <div>
                      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                        Identité
                      </p>
                      <div className="space-y-3">
                        <div>
                          <label className="mb-1.5 block text-xs font-medium text-slate-400">
                            Nom du compte
                          </label>
                          <input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            required
                            placeholder="ex. Cash bureau, CIH Épargne…"
                            className={fieldCls}
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-xs font-medium text-slate-400">
                            Type
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            {ACCOUNT_TYPES.map((key) => (
                              <button
                                key={key}
                                type="button"
                                onClick={() => setType(key)}
                                className={`rounded-xl border p-2.5 text-xs font-medium transition-colors ${
                                  type === key
                                    ? "border-orange-600/50 bg-orange-950/25 text-orange-300"
                                    : "border-slate-700/60 bg-slate-900/60 text-slate-400 hover:border-slate-600"
                                }`}
                              >
                                {typeLabels[key] ?? key}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Section 2 : Disponibilité */}
                    <div>
                      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                        Disponibilité
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {AVAILABILITY_OPTIONS.map((key) => {
                          const isSel = availability === key;
                          return (
                            <button
                              key={key}
                              type="button"
                              onClick={() => setAvailability(key)}
                              className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors ${
                                isSel
                                  ? "border-orange-600/50 bg-orange-950/25"
                                  : "border-slate-700/50 bg-slate-900/60 hover:border-slate-600"
                              }`}
                            >
                              <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                                key === "immediate" ? "bg-emerald-500"
                                : key === "close" ? "bg-amber-500"
                                : key === "distant" ? "bg-amber-600"
                                : "bg-slate-600"
                              }`} />
                              <div>
                                <p className={`text-xs font-medium ${isSel ? "text-orange-300" : "text-slate-300"}`}>
                                  {availLabels[key]}
                                </p>
                                <p className="mt-0.5 text-[10px] leading-tight text-slate-600">
                                  {key === "immediate" ? "Utilisable maintenant"
                                  : key === "close" ? "Facile à récupérer"
                                  : key === "distant" ? "Agent / autre pays"
                                  : "Difficile à accéder"}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Section 3 : Solde */}
                    <div>
                      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                        Solde
                      </p>
                      <div className={!editing ? "grid grid-cols-2 gap-2" : undefined}>
                        <div>
                          <label className="mb-1.5 block text-xs font-medium text-slate-400">
                            Devise
                          </label>
                          <select
                            value={currency}
                            onChange={(e) => setCurrency(e.target.value)}
                            required
                            className={fieldCls}
                          >
                            {currencies.map((c) => (
                              <option key={c.code} value={c.code}>
                                {c.code}
                              </option>
                            ))}
                          </select>
                        </div>
                        {!editing && (
                          <div>
                            <label className="mb-1.5 block text-xs font-medium text-slate-400">
                              Solde initial
                            </label>
                            <input
                              type="number"
                              step="0.01"
                              value={balance}
                              onChange={(e) => setBalance(e.target.value)}
                              required
                              placeholder="0.00"
                              className={fieldCls}
                            />
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Section 4 : Note */}
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-400">
                        Note
                      </label>
                      <input
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Optionnel"
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
                      disabled={saving}
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
      </div>
    </PageWrapper>
  );
}

const fieldCls =
  "w-full rounded-xl border border-slate-700/80 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 transition-colors focus:border-orange-500/70 focus:outline-none focus:ring-1 focus:ring-orange-500/20";
