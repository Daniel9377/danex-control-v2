"use client";

// Force dynamic rendering — client financial data changes after every
// transaction and must never be served from the Next.js SSR cache.
export const dynamic = "force-dynamic";

import { useState, useMemo } from "react";
import { use } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useClients } from "@/hooks/useClients";
import { useOrders } from "@/hooks/useOrders";
import { useAllClientFinancials } from "@/hooks/useClientFinancials";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingPage } from "@/components/ui/LoadingSpinner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { TrustLevel } from "@/lib/supabase/types";
import { formatMoney } from "@/lib/currency";
import {
  Plus, Pencil, Trash2, MapPin, Phone,
  ChevronDown, ChevronUp, AlertTriangle, Search, X,
} from "lucide-react";
import { useSubmit } from "@/hooks/useSubmit";

type Props = { params: Promise<{ locale: string }> };

const TRUST_LEVELS: TrustLevel[] = ["standard", "vip", "risky"];
const trustVariant: Record<TrustLevel, "default" | "orange" | "danger"> = {
  standard: "default", vip: "orange", risky: "danger",
};

const fieldCls =
  "w-full rounded-xl border border-slate-700/80 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-orange-500/70 focus:outline-none focus:ring-1 focus:ring-orange-500/20";

export default function ClientsPage({ params }: Props) {
  const { locale } = use(params);
  const t = useTranslations("clients");
  const tc = useTranslations("common");
  const to = useTranslations("orders");
  const { clients, loading, addClient, updateClient, deleteClient } = useClients();
  const { orders } = useOrders();
  const { financials } = useAllClientFinancials();
  const { submitting, submit } = useSubmit();

  const [showForm, setShowForm]     = useState(false);
  const [editing, setEditing]       = useState<string | null>(null);
  const [deleteId, setDeleteId]     = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [search, setSearch]         = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [name, setName]           = useState("");
  const [phone, setPhone]         = useState("");
  const [country, setCountry]     = useState("");
  const [city, setCity]           = useState("");
  const [trustLevel, setTrustLevel] = useState<TrustLevel>("standard");
  const [note, setNote]           = useState("");

  function openAdd() {
    setEditing(null);
    setName(""); setPhone(""); setCountry(""); setCity("");
    setTrustLevel("standard"); setNote("");
    setShowForm(true);
  }

  function openEdit(id: string) {
    const c = clients.find((cl) => cl.id === id);
    if (!c) return;
    setEditing(id);
    setName(c.name); setPhone(c.phone ?? ""); setCountry(c.country ?? "");
    setCity(c.city ?? ""); setTrustLevel(c.trust_level); setNote(c.note ?? "");
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submit(async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      if (editing) {
        await updateClient(editing, {
          name, phone: phone || null, country: country || null,
          city: city || null, trust_level: trustLevel, note: note || null,
        });
      } else {
        await addClient(user.id, name, phone || null, country || null,
          city || null, trustLevel, note || null);
      }
      setShowForm(false);
    });
  }

  const filtered = useMemo(
    () => {
      const q = search.toLowerCase().trim();
      if (!q) return clients;
      const digits = q.replace(/\D/g, ""); // for phone search by digits only
      return clients.filter((c) =>
        c.name.toLowerCase().includes(q) ||
        (c.country ?? "").toLowerCase().includes(q) ||
        (digits && (c.phone ?? "").replace(/\D/g, "").includes(digits))
      );
    },
    [clients, search]
  );

  const summary = useMemo(() => {
    const activeOrders = orders.filter((o) => o.status !== "cancelled" && o.status !== "paid");
    const deficitCount = Object.values(financials).filter((f) => f && f.balance < 0).length;
    return { activeOrdersCount: activeOrders.length, deficitCount };
  }, [orders, financials]);

  if (loading) return <PageWrapper locale={locale}><LoadingPage /></PageWrapper>;

  return (
    <PageWrapper locale={locale}>
      <div className="space-y-4">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-50">{t("title")}</h1>
            {clients.length > 0 && (
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                <span className="text-slate-500">
                  {clients.length} client{clients.length > 1 ? "s" : ""}
                </span>
                {summary.activeOrdersCount > 0 && (
                  <span className="text-orange-400/80">
                    {summary.activeOrdersCount} cmd actives
                  </span>
                )}
                {summary.deficitCount > 0 && (
                  <span className="flex items-center gap-1 text-red-400/80">
                    <AlertTriangle size={9} />
                    {summary.deficitCount} déficit{summary.deficitCount > 1 ? "s" : ""}
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

        {/* ── Search ── */}
        {clients.length > 0 && (
          <div className="relative">
            <Search size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tc("search")}
              className="w-full rounded-xl border border-slate-700/80 bg-slate-900 py-2.5 pl-8 pr-9 text-sm text-slate-100 placeholder:text-slate-600 focus:border-orange-500/70 focus:outline-none"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 transition-colors hover:text-slate-400"
                aria-label="Effacer la recherche"
              >
                <X size={12} />
              </button>
            )}
          </div>
        )}

        {/* ── Results header ── */}
        {filtered.length > 0 && (
          <SectionHeader label={`${filtered.length} résultat${filtered.length > 1 ? "s" : ""}`} />
        )}

        {/* ── Client list ── */}
        {clients.length === 0 ? (
          <EmptyState message={tc("empty")} />
        ) : filtered.length === 0 ? (
          <EmptyState message="Aucun client ne correspond à la recherche." />
        ) : (
          <Card className="overflow-hidden p-0">
            <ul className="divide-y divide-slate-800/50">
              {filtered.map((client) => {
                const fin          = financials[client.id];
                const clientOrders = orders.filter((o) => o.client_id === client.id);
                const activeOrders = clientOrders.filter(
                  (o) => o.status !== "cancelled" && o.status !== "paid"
                );
                const isExpanded   = expandedId === client.id;
                const hasDeficit   = fin && fin.balance < 0;
                const hasFinancials = fin && (fin.totalReceived > 0 || fin.balance !== 0);

                return (
                  <li key={client.id}>
                    <div
                      className={`transition-colors hover:bg-slate-800/20 ${
                        isExpanded ? "bg-slate-800/30" : ""
                      } ${hasDeficit ? "border-l-2 border-red-800/50" : ""}`}
                    >
                      {/* ── Row: phone (primary), name, amounts, actions ── */}
                      <div className="flex items-center gap-3 px-4 py-3">
                        {/* Expand toggle */}
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : client.id)}
                          aria-label={isExpanded ? "Réduire" : "Voir détail"}
                          className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-slate-800 hover:text-slate-300 shrink-0"
                        >
                          {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>

                        {/* Identity */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="truncate font-mono text-sm font-semibold tabular-nums text-slate-100">
                              {client.phone || "—"}
                            </span>
                            <Badge variant={trustVariant[client.trust_level]}>
                              {t(`trust_levels.${client.trust_level}`)}
                            </Badge>
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5 min-w-0">
                            <span className="truncate text-xs text-slate-400">
                              {client.name}
                            </span>
                            {client.city && (
                              <>
                                <span className="text-slate-700">·</span>
                                <span className="truncate text-[11px] text-slate-600">
                                  {client.city}
                                </span>
                              </>
                            )}
                            {activeOrders.length > 0 && (
                              <>
                                <span className="text-slate-700">·</span>
                                <span className="shrink-0 text-[11px] text-orange-400/80">
                                  {activeOrders.length} cmd
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Amounts — always visible */}
                        <div className="flex shrink-0 items-center gap-4 text-right">
                          {hasFinancials ? (
                            <>
                              <div className="hidden sm:block">
                                <p className="text-[10px] text-slate-600">Reçu</p>
                                <p className="font-mono text-xs tabular-nums text-slate-300">
                                  {formatMoney(fin.totalReceived, fin.currency)}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-600">Solde</p>
                                <p className={`font-mono text-sm font-bold tabular-nums ${
                                  hasDeficit ? "text-red-400" : "text-emerald-400"
                                }`}>
                                  {hasDeficit ? "−" : ""}{formatMoney(Math.abs(fin.balance), fin.currency)}
                                </p>
                              </div>
                            </>
                          ) : (
                            <span className="text-[11px] text-slate-600">—</span>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex shrink-0 items-center gap-0.5">
                          <button
                            onClick={() => openEdit(client.id)}
                            aria-label="Modifier"
                            className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-slate-800 hover:text-slate-300"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            onClick={() => setDeleteId(client.id)}
                            aria-label="Supprimer"
                            className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-slate-800 hover:text-red-400"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>

                      {/* ── Expanded detail ── */}
                      {isExpanded && fin && (
                        <div className="border-t border-slate-800/50 px-4 pb-4 pt-3">
                          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                            Détail financier
                          </p>
                          <div className="space-y-1.5">
                            <FinRow label="Argent reçu"      value={fin.totalReceived}      currency={fin.currency} color="emerald" />
                            <FinRow label="Achats produits"  value={-fin.totalProductCost}  currency={fin.currency} color="red" />
                            <FinRow label="Frais"            value={-fin.totalFees}         currency={fin.currency} color="red" />
                            {fin.totalRefunded > 0 && (
                              <FinRow label="Remboursé" value={-fin.totalRefunded} currency={fin.currency} color="red" />
                            )}
                            {fin.totalProfitValidated > 0 && (
                              <FinRow label="Bénéfice validé" value={fin.totalProfitValidated} currency={fin.currency} color="emerald" />
                            )}
                          </div>

                          <div className="mt-2 flex items-center justify-between border-t border-slate-800 pt-2">
                            <span className="text-xs text-slate-400">Solde restant</span>
                            <span className={`font-mono text-sm font-bold tabular-nums ${
                              fin.balance >= 0 ? "text-emerald-400" : "text-red-400"
                            }`}>
                              {fin.balance >= 0 ? "" : "−"}{formatMoney(Math.abs(fin.balance), fin.currency)}
                            </span>
                          </div>

                          {clientOrders.length > 0 && (
                            <div className="mt-3">
                              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                                Commandes
                              </p>
                              <div className="space-y-1">
                                {clientOrders.map((o) => (
                                  <div key={o.id} className="flex items-center justify-between gap-2">
                                    <span className="min-w-0 truncate text-xs text-slate-400">
                                      {o.product_name}
                                    </span>
                                    <Badge
                                      variant={
                                        o.status === "paid" ? "success"
                                        : o.status === "cancelled" ? "default"
                                        : "orange"
                                      }
                                    >
                                      {to(`statuses.${o.status}`)}
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {client.note && (
                            <p className="mt-2.5 text-[11px] text-slate-600">{client.note}</p>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}
      </div>

      {/* ── Add / Edit modal ─────────────────────────────────────────────────── */}
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
              <h2 className="text-base font-bold text-slate-50">
                {editing ? tc("edit") : t("add")}
              </h2>
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

                  {/* Name */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
                      {t("name")}
                    </label>
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                      placeholder="Nom du client"
                      className={fieldCls}
                    />
                  </div>

                  {/* Trust level */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
                      {t("trust_level")}
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {TRUST_LEVELS.map((lvl) => (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => setTrustLevel(lvl)}
                          className={`rounded-xl py-2.5 text-xs font-medium transition-colors ${
                            trustLevel === lvl
                              ? "bg-orange-600 text-white"
                              : "border border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                          }`}
                        >
                          {t(`trust_levels.${lvl}`)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Country + City */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-400">
                        {t("country")}
                      </label>
                      <input
                        value={country}
                        onChange={(e) => setCountry(e.target.value)}
                        placeholder="Ex : RDC"
                        className={fieldCls}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-400">
                        {t("city")}
                      </label>
                      <input
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="Ex : Kinshasa"
                        className={fieldCls}
                      />
                    </div>
                  </div>

                  {/* Phone */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
                      {t("phone")} <span className="text-slate-600">(optionnel)</span>
                    </label>
                    <input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+243…"
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
                    disabled={submitting || !name.trim()}
                    className="flex-1 rounded-xl py-2.5 text-sm font-semibold transition-colors bg-orange-600 text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500"
                  >
                    {submitting ? "Enregistrement…" : tc("save")}
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
        message="Supprimer ce client ? Ses transactions resteront mais ne seront plus liées."
        confirmLabel={tc("delete")}
        cancelLabel={tc("cancel")}
        danger
        onConfirm={async () => {
          if (!deleteId) return;
          try {
            await deleteClient(deleteId);
            setDeleteId(null);
            setDeleteError(null);
          } catch (err: unknown) {
            setDeleteError(err instanceof Error ? err.message : "Échec de la suppression.");
          }
        }}
        message={
          deleteError
            ? `Erreur : ${deleteError}`
            : "Supprimer ce client ? Ses transactions resteront mais ne seront plus liées."
        }
        onCancel={() => setDeleteId(null)}
      />
    </PageWrapper>
  );
}

// ── Helper component ──────────────────────────────────────────────────────────

function FinRow({
  label, value, currency, color,
}: {
  label: string;
  value: number;
  currency: string;
  color: "emerald" | "red" | "amber";
}) {
  if (Math.abs(value) < 0.01) return null;
  const colorClass =
    color === "emerald" ? "text-emerald-400"
    : color === "red"   ? "text-red-400"
    : "text-amber-400";
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`font-mono text-xs tabular-nums ${colorClass}`}>
        {value > 0 ? "+" : ""}{formatMoney(value, currency)}
      </span>
    </div>
  );
}
