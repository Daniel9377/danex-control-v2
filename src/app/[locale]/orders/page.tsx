"use client";

import { useState, useMemo } from "react";
import { use } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useOrders } from "@/hooks/useOrders";
import { useClients } from "@/hooks/useClients";
import { useCurrencies } from "@/hooks/useCurrencies";
import { useOrderItems, computeExpectedMargin } from "@/hooks/useOrderItems";
import { useTransactions, CreateOperationInput } from "@/hooks/useTransactions";
import { useAccounts } from "@/hooks/useAccounts";
import { useDebts } from "@/hooks/useDebts";
import { useSubmit } from "@/hooks/useSubmit";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingPage } from "@/components/ui/LoadingSpinner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { TransactionFormModal } from "@/components/transactions/TransactionFormModal";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { OrderStatus, TransactionSubType, Transaction } from "@/lib/supabase/types";
import { formatDate, daysSinceUpdate } from "@/lib/utils";
import { formatMoney } from "@/lib/currency";
import {
  Plus, Pencil, Trash2, AlertTriangle, ChevronDown, ChevronUp, X,
} from "lucide-react";

type Props = { params: Promise<{ locale: string }> };

const ORDER_STATUSES: OrderStatus[] = [
  "new", "sourcing", "ordered", "shipped", "delivered", "paid", "cancelled",
];

const statusVariant: Record<OrderStatus, "default" | "info" | "warning" | "success" | "danger" | "orange"> = {
  new: "default", sourcing: "info", ordered: "orange",
  shipped: "info", delivered: "success", paid: "success", cancelled: "danger",
};

const TIMELINE_STEPS: OrderStatus[] = ["new", "ordered", "shipped", "delivered", "paid"];

function computeOrderCosts(txs: Transaction[], orderId: string) {
  let received = 0, productCost = 0, fees = 0, refunded = 0, profitValidated = 0;
  for (const tx of txs) {
    if (tx.order_id !== orderId) continue;
    const amt = Number(tx.amount);
    switch (tx.sub_type) {
      case "client_money_received":   received += amt; break;
      case "client_product_purchase": productCost += amt; break;
      case "client_shipping_fee":     fees += amt; break;
      case "client_refund":           refunded += amt; break;
      case "profit_validated":        profitValidated += amt; break;
    }
  }
  const balance = received - productCost - fees - refunded - profitValidated;
  return { received, productCost, fees, refunded, profitValidated, balance };
}

const fieldCls =
  "w-full rounded-xl border border-slate-700/80 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-orange-500/70 focus:outline-none focus:ring-1 focus:ring-orange-500/20";

export default function OrdersPage({ params }: Props) {
  const { locale } = use(params);
  const t = useTranslations("orders");
  const tc = useTranslations("common");
  const { orders, loading, addOrder, updateOrder, deleteOrder } = useOrders();
  const { clients } = useClients();
  const { currencies } = useCurrencies();
  const { accounts } = useAccounts();
  const { debts } = useDebts();
  const { transactions, createOperation } = useTransactions();
  const { submitting, submit } = useSubmit();

  const [showForm, setShowForm]       = useState(false);
  const [editing, setEditing]         = useState<string | null>(null);
  const [deleteId, setDeleteId]       = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"" | OrderStatus>("");
  const [filterClient, setFilterClient] = useState("");
  const [expandedId, setExpandedId]   = useState<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<"status" | "client" | null>(null);

  const [showTxForm, setShowTxForm] = useState(false);
  const [txFormDefaults, setTxFormDefaults] = useState<{
    subType?: TransactionSubType;
    clientId?: string;
    orderId?: string;
  }>({});

  // Order form fields
  const [clientId, setClientId]           = useState("");
  const [productName, setProductName]     = useState("");
  const [currency, setCurrency]           = useState("USD");
  const [clientPrice, setClientPrice]     = useState("");
  const [supplierPrice, setSupplierPrice] = useState("");
  const [quantity, setQuantity]           = useState("1");
  const [advance, setAdvance]             = useState("0");
  const [status, setStatus]               = useState<OrderStatus>("new");
  const [trackingCode, setTrackingCode]   = useState("");
  const [nextAction, setNextAction]       = useState("");
  const [note, setNote]                   = useState("");

  function openAdd() {
    setEditing(null);
    setClientId(clients[0]?.id ?? ""); setProductName(""); setCurrency("USD");
    setClientPrice(""); setSupplierPrice(""); setQuantity("1"); setAdvance("0");
    setStatus("new"); setTrackingCode(""); setNextAction(""); setNote("");
    setShowForm(true);
  }

  function openEdit(id: string) {
    const o = orders.find((or) => or.id === id);
    if (!o) return;
    setEditing(id);
    setClientId(o.client_id); setProductName(o.product_name); setCurrency(o.currency);
    setClientPrice(o.client_price != null ? String(o.client_price) : "");
    setSupplierPrice(o.supplier_price != null ? String(o.supplier_price) : "");
    setQuantity(String(o.quantity));
    setAdvance(String(o.advance_received)); setStatus(o.status);
    setTrackingCode(o.tracking_code ?? ""); setNextAction(o.next_action ?? "");
    setNote(o.note ?? "");
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submit(async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const cp = clientPrice ? Number(clientPrice) : null;
      const sp = supplierPrice ? Number(supplierPrice) : null;
      const qty = parseInt(quantity, 10) || 1;
      if (editing) {
        await updateOrder(editing, {
          client_id: clientId, product_name: productName, currency,
          client_price: cp, supplier_price: sp, quantity: qty,
          advance_received: Number(advance), status,
          tracking_code: trackingCode || null, next_action: nextAction || null, note: note || null,
        });
      } else {
        await addOrder(user.id, clientId, productName, currency, cp, sp,
          Number(advance), status, qty, trackingCode || null, nextAction || null, note || null);
      }
      setShowForm(false);
    });
  }

  async function handleCreateOperation(input: CreateOperationInput) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await createOperation(user.id, input);
  }

  function openOperationForOrder(order: typeof orders[0], subType: TransactionSubType) {
    setTxFormDefaults({ subType, clientId: order.client_id, orderId: order.id });
    setShowTxForm(true);
  }

  const filtered = useMemo(() => orders.filter((o) => {
    if (filterStatus && o.status !== filterStatus) return false;
    if (filterClient && o.client_id !== filterClient) return false;
    return true;
  }), [orders, filterStatus, filterClient]);

  const orderSummary = useMemo(() => {
    const active  = filtered.filter((o) => o.status !== "cancelled" && o.status !== "paid");
    const shipped = filtered.filter((o) => o.status === "shipped");
    const deficitCount = active.filter((o) => computeOrderCosts(transactions, o.id).balance < 0).length;
    const staleCount = active.filter((o) => daysSinceUpdate(o.last_update) >= 7).length;
    return { activeCount: active.length, shippedCount: shipped.length, deficitCount, staleCount };
  }, [filtered, transactions]);

  /** Fast-path margin from the denormalised orders.* columns (list view).
   *  Always in sync with order_items via addOrder / updateOrder.
   *  For the canonical value from order_items, use computeExpectedMargin(). */
  function denormMargin(cp: number | null, sp: number | null, qty: number): number | null {
    if (!cp || !sp) return null;
    return (cp * qty) - sp;
  }

  // Dropdown labels
  const activeStatusLabel = filterStatus ? t(`statuses.${filterStatus}`) : "Tous les statuts";
  const activeClientLabel = filterClient
    ? (clients.find((c) => c.id === filterClient)?.name ?? "Client")
    : "Tous les clients";

  const canSave = !!clientId && !!productName.trim();

  if (loading) return <PageWrapper locale={locale}><LoadingPage /></PageWrapper>;

  return (
    <PageWrapper locale={locale}>
      <div className="space-y-4">

        {/* ── Header ── */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-slate-50">{t("title")}</h1>
            {orders.length > 0 && (
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
                <span className="text-slate-500">
                  {filtered.length} commande{filtered.length !== 1 ? "s" : ""}
                </span>
                {orderSummary.activeCount > 0 && (
                  <span className="text-orange-400/80">
                    {orderSummary.activeCount} active{orderSummary.activeCount !== 1 ? "s" : ""}
                  </span>
                )}
                {orderSummary.shippedCount > 0 && (
                  <span className="text-sky-400/80">
                    {orderSummary.shippedCount} en transit
                  </span>
                )}
                {orderSummary.deficitCount > 0 && (
                  <span className="flex items-center gap-1 text-red-400/80">
                    <AlertTriangle size={9} />
                    {orderSummary.deficitCount} déficit{orderSummary.deficitCount !== 1 ? "s" : ""}
                  </span>
                )}
                {orderSummary.staleCount > 0 && (
                  <span className="flex items-center gap-1 text-amber-400/80">
                    <AlertTriangle size={9} />
                    {orderSummary.staleCount} inactif{orderSummary.staleCount !== 1 ? "s" : ""}
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

        {/* ── Filter dropdowns ── */}
        {openDropdown && (
          <div className="fixed inset-0 z-30" onClick={() => setOpenDropdown(null)} />
        )}

        {orders.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Status dropdown */}
            <div className="relative z-40">
              <button
                onClick={() => setOpenDropdown(openDropdown === "status" ? null : "status")}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  filterStatus
                    ? "border-orange-600/60 bg-orange-950/40 text-orange-300"
                    : "border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300"
                }`}
              >
                <span className="max-w-[120px] truncate">{activeStatusLabel}</span>
                <ChevronDown
                  size={10}
                  className={`shrink-0 transition-transform ${openDropdown === "status" ? "rotate-180" : ""}`}
                />
              </button>
              {openDropdown === "status" && (
                <div className="absolute left-0 top-full z-40 mt-1.5 max-h-[55vh] min-w-[160px] overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 py-1 shadow-2xl">
                  <button
                    onClick={() => { setFilterStatus(""); setOpenDropdown(null); }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-slate-800 ${
                      !filterStatus ? "text-orange-300" : "text-slate-300"
                    }`}
                  >
                    {!filterStatus && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />}
                    Tous les statuts
                  </button>
                  {ORDER_STATUSES.map((s) => (
                    <button
                      key={s}
                      onClick={() => { setFilterStatus(s); setOpenDropdown(null); }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-slate-800 ${
                        filterStatus === s ? "text-orange-300" : "text-slate-400"
                      }`}
                    >
                      {filterStatus === s && (
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                      )}
                      <span className="truncate">{t(`statuses.${s}`)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Client dropdown */}
            {clients.length > 0 && (
              <div className="relative z-40">
                <button
                  onClick={() => setOpenDropdown(openDropdown === "client" ? null : "client")}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    filterClient
                      ? "border-orange-600/60 bg-orange-950/40 text-orange-300"
                      : "border-slate-700 text-slate-500 hover:border-slate-600 hover:text-slate-300"
                  }`}
                >
                  <span className="max-w-[120px] truncate">{activeClientLabel}</span>
                  <ChevronDown
                    size={10}
                    className={`shrink-0 transition-transform ${openDropdown === "client" ? "rotate-180" : ""}`}
                  />
                </button>
                {openDropdown === "client" && (
                  <div className="absolute right-0 top-full z-40 mt-1.5 max-h-[55vh] min-w-[160px] overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 py-1 shadow-2xl">
                    <button
                      onClick={() => { setFilterClient(""); setOpenDropdown(null); }}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-slate-800 ${
                        !filterClient ? "text-orange-300" : "text-slate-300"
                      }`}
                    >
                      {!filterClient && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />}
                      Tous les clients
                    </button>
                    {clients.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => { setFilterClient(c.id); setOpenDropdown(null); }}
                        className={`flex w-full items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-slate-800 ${
                          filterClient === c.id ? "text-orange-300" : "text-slate-400"
                        }`}
                      >
                        {filterClient === c.id && (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                        )}
                        <span className="truncate">{c.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Active filter clear */}
            {(filterStatus || filterClient) && (
              <button
                onClick={() => { setFilterStatus(""); setFilterClient(""); }}
                className="flex items-center gap-1 text-xs text-slate-600 transition-colors hover:text-slate-400"
              >
                <X size={10} />
                Réinitialiser
              </button>
            )}
          </div>
        )}

        {/* ── Section header ── */}
        {filtered.length > 0 && (
          <SectionHeader label={`${filtered.length} commande${filtered.length !== 1 ? "s" : ""}`} />
        )}

        {/* ── Order list ── */}
        {orders.length === 0 ? (
          <EmptyState message={tc("empty")} />
        ) : filtered.length === 0 ? (
          <EmptyState message="Aucune commande ne correspond aux filtres." />
        ) : (
          <div className="space-y-2">
            {filtered.map((order) => {
              const client    = clients.find((c) => c.id === order.client_id);
              const qty       = order.quantity;
              const margin    = denormMargin(order.client_price, order.supplier_price, qty);
              const stale     = daysSinceUpdate(order.last_update) >= 7
                && order.status !== "paid" && order.status !== "cancelled";
              const isExpanded = expandedId === order.id;
              const costs     = computeOrderCosts(transactions, order.id);
              const isDeficit = costs.balance < 0 && (costs.received > 0 || costs.productCost > 0);
              const stepIdx   = TIMELINE_STEPS.indexOf(order.status);
              const hasCosts  = costs.received > 0 || costs.productCost > 0;

              return (
                <Card
                  key={order.id}
                  className={`transition-colors hover:border-slate-600 ${
                    isDeficit ? "border-red-900/30" : ""
                  }`}
                >
                  <article>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">

                        {/* Product name + status badge */}
                        <div className="flex min-w-0 items-start gap-2">
                          <div className="min-w-0 flex-1">
                            <h3 className="truncate text-sm font-bold text-slate-100">
                              {order.product_name}
                            </h3>
                            <p className="truncate text-[11px] text-slate-500">
                              {client?.name ?? "—"}
                              {order.tracking_code && (
                                <span className="ml-2 font-mono text-slate-700">
                                  {order.tracking_code}
                                </span>
                              )}
                            </p>
                          </div>
                          <div className="flex shrink-0 items-center gap-1.5">
                            {stale && (
                              <AlertTriangle size={11} className="shrink-0 text-amber-500/80" />
                            )}
                            <Badge variant={statusVariant[order.status]}>
                              {t(`statuses.${order.status}`)}
                            </Badge>
                          </div>
                        </div>

                        {/* Mini-timeline (not cancelled) */}
                        {order.status !== "cancelled" && (
                          <div className="mt-2 flex items-center gap-0.5">
                            {TIMELINE_STEPS.map((s, i) => {
                              const done   = stepIdx >= i;
                              const active = order.status === s;
                              return (
                                <div key={s} className="flex items-center">
                                  <div className={`h-1.5 w-1.5 rounded-full transition-colors ${
                                    active ? "bg-orange-500 ring-2 ring-orange-500/30"
                                    : done  ? "bg-slate-500"
                                    : "bg-slate-700"
                                  }`} />
                                  {i < TIMELINE_STEPS.length - 1 && (
                                    <div className={`h-px w-5 ${
                                      done && stepIdx > i ? "bg-slate-600" : "bg-slate-800"
                                    }`} />
                                  )}
                                </div>
                              );
                            })}
                            {order.client_price && (
                              <span className="ml-2 font-mono text-[10px] text-slate-500">
                                {formatMoney(order.client_price, order.currency)}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Margin + cost chips */}
                        {(margin !== null || hasCosts) && (
                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            {margin !== null && (
                              <span className="rounded-full bg-slate-800/80 px-2 py-0.5 text-[10px]">
                                <span className="text-slate-600">{t("expected_margin")}</span>{" "}
                                <span className={`font-mono font-semibold ${
                                  margin >= 0 ? "text-emerald-400" : "text-red-400"
                                }`}>
                                  {margin >= 0 ? "+" : "−"}{formatMoney(Math.abs(margin), order.currency)}
                                </span>
                              </span>
                            )}
                            {costs.received > 0 && (
                              <span className="rounded-full bg-emerald-950/40 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                                +{formatMoney(costs.received, order.currency)}
                              </span>
                            )}
                            {(costs.productCost + costs.fees) > 0 && (
                              <span className="rounded-full bg-red-950/30 px-2 py-0.5 text-[10px] font-medium text-red-400">
                                −{formatMoney(costs.productCost + costs.fees, order.currency)}
                              </span>
                            )}
                            {hasCosts && (
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                isDeficit
                                  ? "bg-red-950/40 text-red-300"
                                  : "bg-slate-800/80 text-slate-400"
                              }`}>
                                {isDeficit ? "−" : "="}{formatMoney(Math.abs(costs.balance), order.currency)}
                                {isDeficit && " ⚠"}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Next action */}
                        {order.next_action && (
                          <p className="mt-1.5 truncate text-[11px] text-orange-400/70">
                            → {order.next_action}
                          </p>
                        )}

                        {/* Last update */}
                        {order.last_update && (
                          <p className="mt-1 text-[10px] text-slate-700">
                            MAJ {formatDate(order.last_update)}
                          </p>
                        )}
                      </div>

                      {/* Action buttons — horizontal row */}
                      <div className="flex shrink-0 items-start gap-0.5">
                        <button
                          onClick={() => setExpandedId(isExpanded ? null : order.id)}
                          aria-label={isExpanded ? "Réduire" : "Voir détail"}
                          className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-slate-800 hover:text-slate-300"
                        >
                          {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>
                        <button
                          onClick={() => openEdit(order.id)}
                          aria-label="Modifier"
                          className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-slate-800 hover:text-slate-300"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          onClick={() => setDeleteId(order.id)}
                          aria-label="Supprimer"
                          className="rounded-lg p-1.5 text-slate-600 transition-colors hover:bg-slate-800 hover:text-red-400"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>

                    {/* ── Expanded detail ── */}
                    {isExpanded && (
                      <div className="mt-3 space-y-4 border-t border-slate-800 pt-3">

                        {/* Financial detail */}
                        {hasCosts && (
                          <div>
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                              Suivi financier
                            </p>
                            <div className="space-y-1.5">
                              {[
                                { label: "Argent reçu",     val: costs.received,         color: "emerald" },
                                { label: "Achat produit",   val: -costs.productCost,      color: "red" },
                                { label: "Frais",           val: -costs.fees,             color: "red" },
                                { label: "Remboursé",       val: -costs.refunded,         color: "red" },
                                { label: t("realized_profit"), val: costs.profitValidated,   color: "emerald" },
                              ]
                                .filter((r) => Math.abs(r.val) > 0.01)
                                .map((r) => (
                                  <div key={r.label} className="flex items-center justify-between gap-2">
                                    <span className="text-xs text-slate-500">{r.label}</span>
                                    <span className={`font-mono text-xs tabular-nums ${
                                      r.color === "emerald" ? "text-emerald-400" : "text-red-400"
                                    }`}>
                                      {r.val > 0 ? "+" : ""}{formatMoney(r.val, order.currency)}
                                    </span>
                                  </div>
                                ))}
                            </div>
                            <div className="mt-2 flex items-center justify-between border-t border-slate-800 pt-2">
                              <span className="text-xs text-slate-400">Solde client restant</span>
                              <span className={`font-mono text-sm font-bold tabular-nums ${
                                costs.balance >= 0 ? "text-orange-400" : "text-red-400"
                              }`}>
                                {costs.balance >= 0 ? "" : "−"}{formatMoney(Math.abs(costs.balance), order.currency)}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* Order info */}
                        {(order.note || order.tracking_code || order.next_action) && (
                          <div>
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                              Informations
                            </p>
                            <div className="space-y-1.5">
                              {order.tracking_code && (
                                <div className="flex items-center justify-between gap-2">
                                  <span className="text-xs text-slate-500">Tracking</span>
                                  <span className="font-mono text-xs text-slate-300">{order.tracking_code}</span>
                                </div>
                              )}
                              {order.next_action && (
                                <div className="flex items-start justify-between gap-2">
                                  <span className="shrink-0 text-xs text-slate-500">Prochaine action</span>
                                  <span className="text-right text-xs text-orange-400/80">{order.next_action}</span>
                                </div>
                              )}
                              {order.note && (
                                <div className="flex items-start justify-between gap-2">
                                  <span className="shrink-0 text-xs text-slate-500">Note</span>
                                  <span className="text-right text-xs text-slate-400">{order.note}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Quick actions */}
                        {order.status !== "cancelled" && order.status !== "paid" && (
                          <div>
                            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                              Enregistrer une opération
                            </p>
                            <div className="flex flex-wrap gap-2">
                              <ActionBtn
                                label="Argent reçu"
                                onClick={() => openOperationForOrder(order, "client_money_received")}
                                color="emerald"
                              />
                              <ActionBtn
                                label="Achat"
                                onClick={() => openOperationForOrder(order, "client_product_purchase")}
                                color="red"
                              />
                              <ActionBtn
                                label="Frais"
                                onClick={() => openOperationForOrder(order, "client_shipping_fee")}
                                color="amber"
                              />
                              {costs.received > costs.productCost + costs.fees && (
                                <ActionBtn
                                  label="Valider bénéfice"
                                  onClick={() => openOperationForOrder(order, "profit_validated")}
                                  color="orange"
                                />
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Order form modal ─────────────────────────────────────────────────── */}
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

                  {/* Client */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
                      {t("client")}
                    </label>
                    <select
                      value={clientId}
                      onChange={(e) => setClientId(e.target.value)}
                      required
                      className={fieldCls}
                    >
                      <option value="">— Sélectionner —</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Product name */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
                      {t("product")}
                    </label>
                    <input
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                      required
                      placeholder="Nom du produit ou commande"
                      className={fieldCls}
                    />
                  </div>

                  {/* Status */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
                      {t("status")}
                    </label>
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value as OrderStatus)}
                      className={fieldCls}
                    >
                      {ORDER_STATUSES.map((s) => (
                        <option key={s} value={s}>{t(`statuses.${s}`)}</option>
                      ))}
                    </select>
                  </div>

                  {/* Currency + Client price + Supplier price */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">Devise</label>
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

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-400">
                        {t("client_price")}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={clientPrice}
                        onChange={(e) => setClientPrice(e.target.value)}
                        placeholder="0.00"
                        className={`${fieldCls} font-mono tabular-nums`}
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-slate-400">
                        {t("supplier_price")}
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={supplierPrice}
                        onChange={(e) => setSupplierPrice(e.target.value)}
                        placeholder="0.00"
                        className={`${fieldCls} font-mono tabular-nums`}
                      />
                    </div>
                  </div>

                  {/* Quantity */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
                      {t("quantity")}
                    </label>
                    <input
                      type="number"
                      step="1"
                      min="1"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value)}
                      placeholder="1"
                      className={`${fieldCls} font-mono tabular-nums w-24`}
                    />
                  </div>

                  {/* Live margin preview */}
                  {(clientPrice || supplierPrice) && (() => {
                    const cp = parseFloat(clientPrice) || 0;
                    const sp = parseFloat(supplierPrice) || 0;
                    const qty = parseInt(quantity, 10) || 1;
                    const total = cp * qty;
                    const margin = (cp > 0 || sp > 0) ? denormMargin(cp || null, sp || null, qty) : null;
                    return (
                      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
                          {t("expected_margin")}
                        </p>
                        {cp > 0 && (
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs text-slate-500">Total client</span>
                            <span className="font-mono text-xs text-slate-300">
                              {formatMoney(cp, currency)} × {qty} = {formatMoney(total, currency)}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between gap-3 border-t border-slate-800 pt-2">
                          <span className="text-xs text-slate-500">Marge</span>
                          <span className={`font-mono text-sm font-bold tabular-nums ${
                            margin !== null && margin >= 0 ? "text-emerald-400" : "text-red-400"
                          }`}>
                            {margin !== null
                              ? `${margin >= 0 ? "+" : "−"}${formatMoney(Math.abs(margin), currency)}`
                              : "—"}
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Advance */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
                      {t("advance")} <span className="text-slate-600">(acompte reçu)</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={advance}
                      onChange={(e) => setAdvance(e.target.value)}
                      placeholder="0.00"
                      className={`${fieldCls} font-mono tabular-nums`}
                    />
                  </div>

                  {/* Tracking */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
                      {t("tracking")} <span className="text-slate-600">(optionnel)</span>
                    </label>
                    <input
                      value={trackingCode}
                      onChange={(e) => setTrackingCode(e.target.value)}
                      placeholder="Ex : CN123456789"
                      className={fieldCls}
                    />
                  </div>

                  {/* Next action */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-slate-400">
                      {t("next_action")} <span className="text-slate-600">(optionnel)</span>
                    </label>
                    <input
                      value={nextAction}
                      onChange={(e) => setNextAction(e.target.value)}
                      placeholder="Ex : Contacter le fournisseur"
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
                    disabled={submitting || !canSave}
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

      {/* ── Transaction form for quick order operations ── */}
      <TransactionFormModal
        open={showTxForm}
        accounts={accounts}
        clients={clients}
        orders={orders}
        debts={debts}
        defaultSubType={txFormDefaults.subType}
        onClose={() => setShowTxForm(false)}
        onSubmit={async (input) => {
          const finalInput: CreateOperationInput = {
            ...input,
            clientId: input.clientId ?? txFormDefaults.clientId,
            orderId:  input.orderId  ?? txFormDefaults.orderId,
          };
          await handleCreateOperation(finalInput);
        }}
      />

      {/* ── Confirm delete ── */}
      <ConfirmDialog
        open={!!deleteId}
        title={tc("confirm_delete")}
        message="Supprimer cette commande ?"
        confirmLabel={tc("delete")}
        cancelLabel={tc("cancel")}
        danger
        onConfirm={async () => { if (deleteId) await deleteOrder(deleteId); setDeleteId(null); }}
        onCancel={() => setDeleteId(null)}
      />
    </PageWrapper>
  );
}

// ── ActionBtn helper ──────────────────────────────────────────────────────────

function ActionBtn({
  label, onClick, color,
}: {
  label: string;
  onClick: () => void;
  color: string;
}) {
  const colors: Record<string, string> = {
    emerald: "border-emerald-800/50 text-emerald-400 hover:bg-emerald-950/40",
    red:     "border-red-800/50 text-red-400 hover:bg-red-950/40",
    amber:   "border-amber-800/50 text-amber-400 hover:bg-amber-950/40",
    orange:  "border-orange-700/50 text-orange-400 hover:bg-orange-950/40",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
        colors[color] ?? colors.amber
      }`}
    >
      {label}
    </button>
  );
}
