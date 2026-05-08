"use client";

import { useState } from "react";
import { use } from "react";
import { useTranslations } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useOrders } from "@/hooks/useOrders";
import { useClients } from "@/hooks/useClients";
import { useCurrencies } from "@/hooks/useCurrencies";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Card } from "@/components/ui/Card";
import { MoneyAmount } from "@/components/ui/MoneyAmount";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { LoadingPage } from "@/components/ui/LoadingSpinner";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { OrderStatus } from "@/lib/supabase/types";
import { formatDate, daysSinceUpdate } from "@/lib/utils";
import { Plus, Pencil, Trash2, AlertTriangle } from "lucide-react";

type Props = { params: Promise<{ locale: string }> };

const ORDER_STATUSES: OrderStatus[] = [
  "new", "sourcing", "ordered", "shipped", "delivered", "paid", "cancelled",
];

const statusVariant: Record<OrderStatus, "default" | "info" | "warning" | "success" | "danger" | "orange"> = {
  new: "default",
  sourcing: "info",
  ordered: "orange",
  shipped: "info",
  delivered: "success",
  paid: "success",
  cancelled: "danger",
};

export default function OrdersPage({ params }: Props) {
  const { locale } = use(params);
  const t = useTranslations("orders");
  const tc = useTranslations("common");
  const { orders, loading, addOrder, updateOrder, deleteOrder } = useOrders();
  const { clients } = useClients();
  const { currencies } = useCurrencies();

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<"" | OrderStatus>("");
  const [filterClient, setFilterClient] = useState("");

  const [clientId, setClientId] = useState("");
  const [productName, setProductName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [clientPrice, setClientPrice] = useState("");
  const [supplierPrice, setSupplierPrice] = useState("");
  const [advance, setAdvance] = useState("0");
  const [status, setStatus] = useState<OrderStatus>("new");
  const [trackingCode, setTrackingCode] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [note, setNote] = useState("");

  function openAdd() {
    setEditing(null);
    setClientId(clients[0]?.id ?? ""); setProductName(""); setCurrency("USD");
    setClientPrice(""); setSupplierPrice(""); setAdvance("0");
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
    setAdvance(String(o.advance_received)); setStatus(o.status);
    setTrackingCode(o.tracking_code ?? ""); setNextAction(o.next_action ?? "");
    setNote(o.note ?? "");
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const cp = clientPrice ? Number(clientPrice) : null;
    const sp = supplierPrice ? Number(supplierPrice) : null;

    if (editing) {
      await updateOrder(editing, {
        client_id: clientId, product_name: productName, currency,
        client_price: cp, supplier_price: sp,
        advance_received: Number(advance), status,
        tracking_code: trackingCode || null, next_action: nextAction || null, note: note || null,
      });
    } else {
      await addOrder(user.id, clientId, productName, currency, cp, sp,
        Number(advance), status, trackingCode || null, nextAction || null, note || null);
    }
    setShowForm(false);
  }

  const filtered = orders.filter((o) => {
    if (filterStatus && o.status !== filterStatus) return false;
    if (filterClient && o.client_id !== filterClient) return false;
    return true;
  });

  function calcMargin(clientPrice: number | null, supplierPrice: number | null): string | null {
    if (!clientPrice || !supplierPrice || supplierPrice === 0) return null;
    const pct = ((clientPrice - supplierPrice) / supplierPrice) * 100;
    return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
  }

  if (loading) return <PageWrapper locale={locale}><LoadingPage /></PageWrapper>;

  return (
    <PageWrapper locale={locale}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-bold text-slate-50">{t("title")}</h1>
          <button onClick={openAdd}
            className="flex items-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-sm font-medium text-white hover:bg-orange-700">
            <Plus size={15} />
            {t("add")}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as "" | OrderStatus)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 focus:border-orange-500 focus:outline-none">
            <option value="">Tous les statuts</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>{t(`statuses.${s}`)}</option>
            ))}
          </select>
          <select value={filterClient} onChange={(e) => setFilterClient(e.target.value)}
            className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-1.5 text-sm text-slate-300 focus:border-orange-500 focus:outline-none">
            <option value="">Tous les clients</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {filtered.length === 0 ? (
          <EmptyState message={tc("empty")} />
        ) : (
          <div className="space-y-2">
            {filtered.map((order) => {
              const client = clients.find((c) => c.id === order.client_id);
              const margin = calcMargin(order.client_price, order.supplier_price);
              const stale = daysSinceUpdate(order.last_update) >= 7 && order.status !== "paid" && order.status !== "cancelled";

              return (
                <Card key={order.id}>
                  <article className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-base font-semibold text-slate-50">
                          {order.product_name}
                        </h3>
                        <Badge variant={statusVariant[order.status]}>
                          {t(`statuses.${order.status}`)}
                        </Badge>
                        {stale && (
                          <span className="flex items-center gap-1 text-xs text-amber-500">
                            <AlertTriangle size={10} />
                            +7j
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {client?.name ?? "—"}
                        {order.tracking_code && ` · ${order.tracking_code}`}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-500">
                        {order.client_price != null && (
                          <span>Client: <MoneyAmount amount={order.client_price} currency={order.currency} className="text-xs text-slate-300" /></span>
                        )}
                        {order.supplier_price != null && (
                          <span>Fournisseur: <MoneyAmount amount={order.supplier_price} currency={order.currency} className="text-xs text-slate-300" /></span>
                        )}
                        {margin && (
                          <span className={`font-mono ${parseFloat(margin) >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                            Marge: {margin}
                          </span>
                        )}
                      </div>
                      {order.next_action && (
                        <p className="mt-1 truncate text-xs text-orange-400/80">→ {order.next_action}</p>
                      )}
                      {order.advance_received > 0 && (
                        <p className="text-xs text-slate-500">
                          Avance: <MoneyAmount amount={order.advance_received} currency={order.currency} className="text-xs text-slate-400" />
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button onClick={() => openEdit(order.id)}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-slate-300">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => setDeleteId(order.id)}
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-800 hover:text-red-400">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </article>
                  {order.last_update && (
                    <p className="mt-2 text-xs text-slate-600">
                      MAJ: {formatDate(order.last_update)}
                    </p>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4">
          <div className="my-4 w-full max-w-sm rounded-xl border border-slate-800 bg-slate-900 p-6">
            <h2 className="mb-4 text-base font-semibold text-slate-50">
              {editing ? tc("edit") : t("add")}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t("client")}</label>
                <select value={clientId} onChange={(e) => setClientId(e.target.value)} required
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none">
                  <option value="">—</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t("product")}</label>
                <input value={productName} onChange={(e) => setProductName(e.target.value)} required
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t("status")}</label>
                <select value={status} onChange={(e) => setStatus(e.target.value as OrderStatus)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none">
                  {ORDER_STATUSES.map((s) => (
                    <option key={s} value={s}>{t(`statuses.${s}`)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">Devise</label>
                <select value={currency} onChange={(e) => setCurrency(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none">
                  {currencies.map((c) => <option key={c.code} value={c.code}>{c.code}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs text-slate-400">{t("client_price")}</label>
                  <input type="number" step="0.01" value={clientPrice} onChange={(e) => setClientPrice(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-400">{t("supplier_price")}</label>
                  <input type="number" step="0.01" value={supplierPrice} onChange={(e) => setSupplierPrice(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t("advance")}</label>
                <input type="number" step="0.01" value={advance} onChange={(e) => setAdvance(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t("tracking")}</label>
                <input value={trackingCode} onChange={(e) => setTrackingCode(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-400">{t("next_action")}</label>
                <input value={nextAction} onChange={(e) => setNextAction(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100 focus:border-orange-500 focus:outline-none" />
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
