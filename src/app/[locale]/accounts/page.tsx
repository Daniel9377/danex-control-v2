"use client";

// Force dynamic rendering — account balances change frequently and must
// never be served from the Next.js SSR cache (e.g. after debt payments).
export const dynamic = "force-dynamic";

import { useState, useMemo } from "react";
import { use } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAccounts } from "@/hooks/useAccounts";
import { useCurrencies } from "@/hooks/useCurrencies";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { SkeletonList } from "@/components/ui/Skeleton";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Account, AccountType, AccountAvailability, Transaction } from "@/lib/supabase/types";
import { formatDate } from "@/lib/utils";
import { formatMoney } from "@/lib/currency";
import { Plus, Pencil, Trash2, X, AlertTriangle, MoreHorizontal } from "lucide-react";
import { SectionHeader } from "@/components/ui/SectionHeader";

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
  school: "info",         ecole: "info",
  debt: "danger",
  held: "warning",
  other: "default",
  risque: "danger",
};

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
  const { currencies } = useCurrencies();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [availFilter, setAvailFilter] = useState<AccountAvailability | "all">("all");

  const [detailAccount, setDetailAccount] = useState<Account | null>(null);
  const [detailTxs, setDetailTxs] = useState<Transaction[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("personal");
  const [currency, setCurrency] = useState("USD");
  const [balance, setBalance] = useState("0");
  const [note, setNote] = useState("");
  const [availability, setAvailability] = useState<AccountAvailability>("immediate");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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
    if (saving) return;
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
      setSaving(false);
    }
  }

  const monthlySummary = useMemo(() => {
    if (!detailAccount || detailTxs.length === 0) return null;
    const now = new Date();
    const monthTxs = detailTxs.filter((tx) => {
      const d = new Date(tx.transaction_date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    if (monthTxs.length === 0) return null;
    const income = monthTxs.filter((tx) => tx.type === "income").reduce((s, tx) => s + Number(tx.amount), 0);
    const expense = monthTxs.filter((tx) => tx.type === "expense").reduce((s, tx) => s + Number(tx.amount), 0);
    return { income, expense, net: income - expense };
  }, [detailAccount, detailTxs]);

  const byAvail = useMemo(() => {
    const map: Record<string, number> = {};
    accounts.forEach((a) => {
      const k = a.availability ?? "immediate";
      map[k] = (map[k] ?? 0) + 1;
    });
    return map;
  }, [accounts]);

  const negCount = useMemo(
    () => accounts.filter((a) => Number(a.balance) < 0).length,
    [accounts]
  );

  const filteredAccounts = useMemo(() => {
    if (availFilter === "all") return accounts;
    return accounts.filter((a) => (a.availability ?? "immediate") === availFilter);
  }, [accounts, availFilter]);

  return (
    <PageWrapper locale={locale}>
      <div className="space-y-4">
        {loading ? (
          <>
            <div className="flex items-center justify-between gap-4">
              <div className="h-7 w-24 animate-pulse rounded-lg bg-slate-800" />
              <div className="h-9 w-36 animate-pulse rounded-lg bg-slate-800" />
            </div>
            <SkeletonList count={3} />
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-slate-50">{t("title")}</h1>
                {accounts.length > 0 && (
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                    <span className="text-slate-500">
                      {accounts.length} compte{accounts.length > 1 ? "s" : ""}
                    </span>
                    {(byAvail["immediate"] ?? 0) > 0 && (
                      <span className="text-emerald-400/80">
                        {byAvail["immediate"]} disponible{(byAvail["immediate"] ?? 0) > 1 ? "s" : ""}
                      </span>
                    )}
                    {((byAvail["close"] ?? 0) + (byAvail["distant"] ?? 0)) > 0 && (
                      <span className="text-amber-400/80">
                        {(byAvail["close"] ?? 0) + (byAvail["distant"] ?? 0)} proche{((byAvail["close"] ?? 0) + (byAvail["distant"] ?? 0)) > 1 ? "s" : ""}
                      </span>
                    )}
                    {(byAvail["blocked"] ?? 0) > 0 && (
                      <span className="text-slate-500">
                        {byAvail["blocked"]} bloqué{(byAvail["blocked"] ?? 0) > 1 ? "s" : ""}
                      </span>
                    )}
                    {negCount > 0 && (
                      <span className="flex items-center gap-1 text-red-400/80">
                        <AlertTriangle size={9} />
                        {negCount} négatif{negCount > 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
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

            {/* ── Filter pills ────────────────────────────────────────── */}
            {accounts.length > 0 && (() => {
              type PillKey = AccountAvailability | "all";
              const pills: Array<{
                key: PillKey;
                label: string;
                count: number;
                dotClass?: string;
                inactiveClass: string;
              }> = [
                {
                  key: "all",
                  label: "Tous",
                  count: accounts.length,
                  inactiveClass: "border-slate-800 bg-slate-900 text-slate-400",
                },
                {
                  key: "immediate",
                  label: availLabels.immediate,
                  count: byAvail["immediate"] ?? 0,
                  dotClass: "bg-emerald-500",
                  inactiveClass: "border-emerald-800/30 bg-emerald-950/20 text-emerald-400",
                },
                {
                  key: "close",
                  label: availLabels.close,
                  count: byAvail["close"] ?? 0,
                  dotClass: "bg-amber-500",
                  inactiveClass: "border-amber-800/30 bg-amber-950/20 text-amber-400",
                },
                {
                  key: "distant",
                  label: availLabels.distant,
                  count: byAvail["distant"] ?? 0,
                  dotClass: "bg-amber-600",
                  inactiveClass: "border-amber-800/20 bg-amber-950/10 text-amber-500",
                },
                {
                  key: "blocked",
                  label: availLabels.blocked,
                  count: byAvail["blocked"] ?? 0,
                  dotClass: "bg-slate-600",
                  inactiveClass: "border-slate-700/50 bg-slate-800/50 text-slate-500",
                },
              ];
              return (
                <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {pills
                    .filter((p) => p.key === "all" || p.count > 0)
                    .map((pill) => {
                      const isActive = availFilter === pill.key;
                      return (
                        <button
                          key={pill.key}
                          onClick={() => setAvailFilter(pill.key as AccountAvailability | "all")}
                          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                            isActive
                              ? "border-orange-600/50 bg-orange-950/30 text-orange-300"
                              : `${pill.inactiveClass} hover:border-slate-700`
                          }`}
                        >
                          {pill.dotClass && (
                            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${pill.dotClass}`} />
                          )}
                          {pill.label}
                          <span
                            className={`rounded-full px-1 text-[10px] tabular-nums ${
                              isActive
                                ? "bg-orange-900/50 text-orange-300"
                                : "bg-slate-800/80 text-slate-500"
                            }`}
                          >
                            {pill.count}
                          </span>
                        </button>
                      );
                    })}
                  {negCount > 0 && (
                    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-red-800/30 bg-red-950/20 px-2.5 py-1 text-xs text-red-400">
                      <AlertTriangle size={10} />
                      {negCount} négatif{negCount > 1 ? "s" : ""}
                    </span>
                  )}
                </div>
              );
            })()}

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
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {filteredAccounts.map((acc) => {
                  const isNeg = Number(acc.balance) < 0;
                  const availColor =
                    acc.availability === "immediate" ? "bg-emerald-500"
                    : acc.availability === "close" ? "bg-amber-500"
                    : acc.availability === "distant" ? "bg-amber-600"
                    : "bg-slate-600";
                  const availTextColor =
                    acc.availability === "immediate" ? "text-emerald-400"
                    : acc.availability === "blocked" ? "text-slate-500"
                    : "text-amber-400";
                  const isMenuOpen = menuOpenId === acc.id;
                  return (
                    <Card key={acc.id} variant="elevated" className="relative overflow-hidden transition-colors hover:border-slate-600">
                      <div className={`absolute left-0 top-0 h-full w-0.5 ${availColor}`} />
                      <article className="pl-2">

                        {/* Name + "..." */}
                        <div className="flex items-start justify-between gap-2">
                          <button
                            className="min-w-0 flex-1 text-left"
                            onClick={() => openDetail(acc)}
                          >
                            <p className="truncate text-sm font-semibold text-slate-200">
                              {acc.name}
                            </p>
                          </button>
                          <div className="relative z-20 shrink-0">
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
                        </div>

                        {/* Balance + meta */}
                        <button
                          className="mt-2 w-full text-left"
                          onClick={() => openDetail(acc)}
                        >
                          <p className={`font-mono text-2xl font-bold tabular-nums leading-none ${isNeg ? "text-red-400" : "text-slate-50"}`}>
                            {formatMoney(acc.balance, acc.currency)}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                            <span className="text-slate-500">{acc.currency}</span>
                            <span className="text-slate-700">·</span>
                            <Badge
                              variant={TYPE_VARIANT[acc.type] ?? "default"}
                              className="px-1.5 py-0.5 text-[10px]"
                            >
                              {typeLabels[acc.type] ?? acc.type}
                            </Badge>
                            <span className="text-slate-700">·</span>
                            <span className={`flex items-center gap-1 ${availTextColor}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${availColor}`} />
                              {availLabels[acc.availability ?? "immediate"]}
                            </span>
                          </div>
                          {acc.note && (
                            <p className="mt-1 truncate text-[11px] text-slate-600">
                              {acc.note}
                            </p>
                          )}
                          {isNeg && (
                            <p className="mt-1 flex items-center gap-1 text-xs text-red-400">
                              <AlertTriangle size={10} />
                              {t("negative_warning")}
                            </p>
                          )}
                        </button>
                      </article>
                    </Card>
                  );
                })}
              </div>
              </>
            )}
          </>
        )}
      </div>

      {/* ── Account detail drawer ─────────────────────────────────────────── */}
      {detailAccount && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm md:items-center"
          onClick={closeDetail}
        >
          <div
            className="flex max-h-[88vh] w-full max-w-md flex-col rounded-t-2xl border border-slate-800 bg-slate-950 md:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle (mobile) */}
            <div className="flex justify-center pt-2.5 md:hidden">
              <div className="h-1 w-10 rounded-full bg-slate-700" />
            </div>

            {/* Sticky header */}
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-950 px-5 py-3.5">
              <div className="min-w-0">
                <h2 className="truncate text-base font-bold text-slate-50">
                  {detailAccount.name}
                </h2>
                <p className="text-xs text-slate-500">
                  {detailAccount.currency} · {typeLabels[detailAccount.type] ?? detailAccount.type}
                  {detailAccount.availability && ` · ${availLabels[detailAccount.availability]}`}
                </p>
              </div>
              <button
                onClick={closeDetail}
                className="shrink-0 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-300"
              >
                <X size={16} />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="space-y-4">

                {/* Balance block */}
                <div
                  className={`rounded-xl border p-4 ${
                    Number(detailAccount.balance) < 0
                      ? "border-red-800/40 bg-red-950/20"
                      : "border-slate-800 bg-slate-900"
                  }`}
                >
                  <p className="text-xs font-medium text-slate-500">{t("current_balance")}</p>
                  <p
                    className={`mt-1 font-mono text-3xl font-bold tabular-nums ${
                      Number(detailAccount.balance) < 0 ? "text-red-400" : "text-slate-50"
                    }`}
                  >
                    {formatMoney(detailAccount.balance, detailAccount.currency)}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-600">{detailAccount.currency}</p>
                </div>

                {/* Monthly summary */}
                {monthlySummary && (
                  <div>
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                      {t("this_month_detail")}
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-xl border border-slate-800/60 bg-slate-900/60 p-2.5">
                        <p className="text-[10px] text-slate-500">{t("income_in")}</p>
                        <p className="mt-1 font-mono text-sm font-bold tabular-nums text-emerald-400">
                          +{formatMoney(monthlySummary.income, detailAccount.currency)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-800/60 bg-slate-900/60 p-2.5">
                        <p className="text-[10px] text-slate-500">{t("expense_out")}</p>
                        <p className="mt-1 font-mono text-sm font-bold tabular-nums text-red-400">
                          −{formatMoney(monthlySummary.expense, detailAccount.currency)}
                        </p>
                      </div>
                      <div className="rounded-xl border border-slate-800/60 bg-slate-900/60 p-2.5">
                        <p className="text-[10px] text-slate-500">{t("net")}</p>
                        <p
                          className={`mt-1 font-mono text-sm font-bold tabular-nums ${
                            monthlySummary.net >= 0 ? "text-slate-100" : "text-red-400"
                          }`}
                        >
                          {monthlySummary.net >= 0 ? "+" : "−"}
                          {formatMoney(Math.abs(monthlySummary.net), detailAccount.currency)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Recent transactions */}
                <div>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                    {t("recent_ops")}
                  </p>
                  {detailLoading ? (
                    <div className="space-y-2">
                      {[...Array(3)].map((_, i) => (
                        <div key={i} className="h-9 animate-pulse rounded-xl bg-slate-800" />
                      ))}
                    </div>
                  ) : detailTxs.length === 0 ? (
                    <p className="py-4 text-center text-sm text-slate-600">{t("no_ops")}</p>
                  ) : (
                    <ul className="divide-y divide-slate-800/50">
                      {detailTxs.slice(0, 8).map((tx) => (
                        <li
                          key={tx.id}
                          className="flex items-center justify-between gap-3 py-2"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            <span
                              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold ${
                                tx.type === "expense"
                                  ? "bg-red-950/60 text-red-400"
                                  : "bg-emerald-950/60 text-emerald-400"
                              }`}
                            >
                              {tx.type === "expense" ? "−" : "+"}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-xs text-slate-300">
                                {tx.category ?? tx.note ?? "—"}
                              </p>
                              <p className="text-[10px] text-slate-600">
                                {formatDate(tx.transaction_date)}
                              </p>
                            </div>
                          </div>
                          <p
                            className={`shrink-0 font-mono text-xs font-semibold tabular-nums ${
                              tx.type === "expense" ? "text-red-400" : "text-emerald-400"
                            }`}
                          >
                            {tx.type === "expense" ? "−" : "+"}
                            {formatMoney(tx.amount, tx.currency)}
                          </p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </div>

            {/* Footer actions */}
            <div
              className="shrink-0 space-y-2 border-t border-slate-800 px-5 pt-3"
              style={{ paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom, 0px))" }}
            >
              <button
                onClick={() => { closeDetail(); openEdit(detailAccount.id); }}
                aria-label="Modifier ce compte"
                className="flex w-full items-center justify-center rounded-xl border border-slate-700 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 hover:text-slate-100"
              >
                Modifier
              </button>
              <Link
                href={`/${locale}/transactions`}
                onClick={closeDetail}
                className="flex w-full items-center justify-center rounded-xl border border-slate-800 py-2 text-xs text-slate-500 transition-colors hover:border-slate-700 hover:text-slate-300"
              >
                Voir les transactions →
              </Link>
              <button
                onClick={() => { closeDetail(); setDeleteId(detailAccount.id); }}
                aria-label="Supprimer ce compte"
                className="flex w-full items-center justify-center gap-1.5 py-2 text-xs text-red-500/60 transition-colors hover:text-red-400"
              >
                <Trash2 size={11} />
                Supprimer ce compte
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add / edit form modal ─────────────────────────────────────────── */}
      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm md:items-center md:p-4"
          onClick={() => setShowForm(false)}
        >
          <div
            className="flex max-h-[92vh] w-full max-w-md flex-col rounded-t-2xl border border-slate-800 bg-slate-950 shadow-2xl md:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle — mobile only */}
            <div className="flex justify-center pt-2.5 md:hidden">
              <div className="h-1 w-10 rounded-full bg-slate-700" />
            </div>

            {/* Header */}
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

            {/* Scrollable form */}
            <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto px-5 pb-2">
                <div className="space-y-5 py-1">

                  {/* — Section 1 : Identité — */}
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
                          className="w-full rounded-xl border border-slate-700/80 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 transition-colors focus:border-orange-500/70 focus:outline-none focus:ring-1 focus:ring-orange-500/20"
                        />
                      </div>
                      <div>
                        <label className="mb-2 block text-xs font-medium text-slate-400">
                          Type
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {(
                            [
                              "personal", "business", "savings", "school",
                              "held", "emergency", "client", "investment", "debt", "other",
                            ] as AccountType[]
                          ).map((tp) => (
                            <button
                              key={tp}
                              type="button"
                              onClick={() => setType(tp)}
                              className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                                type === tp
                                  ? "border-orange-600/60 bg-orange-950/40 text-orange-300"
                                  : "border-slate-700/50 bg-slate-900/80 text-slate-400 hover:border-slate-600 hover:text-slate-300"
                              }`}
                            >
                              {typeLabels[tp]}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* — Section 2 : Accès — */}
                  <div>
                    <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                      Accès
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          { key: "immediate" as AccountAvailability, dot: "bg-emerald-500", hint: "Utilisable maintenant" },
                          { key: "close" as AccountAvailability, dot: "bg-amber-500", hint: "Facile à récupérer" },
                          { key: "distant" as AccountAvailability, dot: "bg-amber-600", hint: "Agent / autre pays" },
                          { key: "blocked" as AccountAvailability, dot: "bg-slate-600", hint: "Difficile à accéder" },
                        ]
                      ).map(({ key, dot, hint }) => {
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
                            <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${dot}`} />
                            <div>
                              <p className={`text-xs font-medium ${isSel ? "text-orange-300" : "text-slate-300"}`}>
                                {availLabels[key]}
                              </p>
                              <p className="mt-0.5 text-[10px] leading-tight text-slate-600">{hint}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* — Section 3 : Solde — */}
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
                          className="w-full rounded-xl border border-slate-700/80 bg-slate-900 px-3 py-2.5 text-sm text-slate-100 focus:border-orange-500/70 focus:outline-none"
                        >
                          {currencies.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.code} — {c.name}
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
                            className="w-full rounded-xl border border-slate-700/80 bg-slate-900 px-3 py-2.5 font-mono text-sm text-slate-100 tabular-nums focus:border-orange-500/70 focus:outline-none focus:ring-1 focus:ring-orange-500/20"
                          />
                        </div>
                      )}
                    </div>
                    {editing && (
                      <p className="mt-2 text-[11px] text-slate-600">
                        Le solde est calculé automatiquement depuis les transactions.
                      </p>
                    )}
                  </div>

                  {/* — Section 4 : Note — */}
                  <div>
                    <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                      Note
                    </p>
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Optionnel — description courte"
                      className="w-full rounded-xl border border-slate-700/80 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-orange-500/70 focus:outline-none"
                    />
                  </div>

                  {/* Error */}
                  {formError && (
                    <p className="rounded-xl border border-red-800/40 bg-red-950/20 px-3.5 py-2.5 text-xs text-red-400">
                      {formError}
                    </p>
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
                    onClick={() => setShowForm(false)}
                    className="flex-1 rounded-xl border border-slate-700 py-2.5 text-sm text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={!name.trim() || saving}
                    aria-label={saving ? "Sauvegarde en cours" : tc("save")}
                    className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors bg-orange-600 text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                  >
                    {saving ? "Sauvegarde…" : tc("save")}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteId}
        title={tc("confirm_delete")}
        message={t("delete_confirm")}
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
