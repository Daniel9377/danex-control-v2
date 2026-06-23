"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Order, OrderStatus } from "@/lib/supabase/types";
import { cacheGet, cacheSet, cacheInvalidate, cacheInvalidatePrefix } from "@/lib/cache";

const PREFIX = "orders";

export function useOrders(clientId?: string) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const key = clientId ? `${PREFIX}:${clientId}` : `${PREFIX}:all`;
    const cached = cacheGet<Order[]>(key);
    if (cached) {
      setOrders(cached);
      setLoading(false);
      return;
    }
    const supabase = createClient();
    let query = supabase.from("orders").select("*").order("created_at", { ascending: false });
    if (clientId) query = query.eq("client_id", clientId);
    const { data } = await query;
    if (data) {
      cacheSet(key, data as Order[]);
      setOrders(data as Order[]);
    }
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  async function addOrder(
    userId: string,
    clientId: string,
    productName: string,
    currency: string,
    clientPrice: number | null,
    supplierPrice: number | null,
    advanceReceived: number,
    status: OrderStatus,
    quantity: number,
    trackingCode: string | null,
    nextAction: string | null,
    note: string | null
  ) {
    const supabase = createClient();

    // 1. Insert the order — get its ID for the order_items FK
    const { data: order, error } = await supabase
      .from("orders")
      .insert({
        user_id: userId, client_id: clientId, product_name: productName, currency,
        client_price: clientPrice, supplier_price: supplierPrice,
        advance_received: advanceReceived, status, quantity,
        tracking_code: trackingCode,
        next_action: nextAction, note, last_update: new Date().toISOString().split("T")[0],
      })
      .select("id")
      .single();

    if (error || !order) {
      console.error("[addOrder] insert error:", error?.code, error?.message);
      throw new Error(error?.message || "Échec de la création de la commande.");
    }

    // 2. Create the corresponding order_items row (every order has ≥1 item)
    const { error: itemErr } = await supabase.from("order_items").insert({
      order_id: order.id,
      product_name: productName,
      quantity,
      unit_price: clientPrice,
      supplier_unit_cost: supplierPrice,
    });
    if (itemErr) {
      console.error("[addOrder] order_items insert error:", itemErr.code, itemErr.message);
      // Clean up the orphaned order — the UI will show an error either way
      await supabase.from("orders").delete().eq("id", order.id);
      throw new Error(itemErr.message || "Échec de la création des produits.");
    }

    cacheInvalidatePrefix(PREFIX);
    await load();
  }

  async function updateOrder(
    id: string,
    updates: Partial<Omit<Order, "id" | "user_id" | "created_at">>,
    /** If provided, replaces ALL order_items for the order (used by multi-item forms).
     *  If omitted and updates change product fields, the first order_items row
     *  is updated to stay in sync (Simple mode). */
    items?: {
      product_name: string;
      variant?: string | null;
      supplier?: string | null;
      quantity?: number;
      unit_price?: number | null;
      supplier_unit_cost?: number | null;
    }[]
  ) {
    const supabase = createClient();
    const { error } = await supabase
      .from("orders")
      .update({ ...updates, last_update: new Date().toISOString().split("T")[0] })
      .eq("id", id);
    if (error) {
      console.error("[updateOrder] update error:", error.code, error.message);
      throw new Error(error.message || "Échec de la mise à jour de la commande.");
    }

    // Sync order_items
    if (items && items.length > 0) {
      // Multi-item: replace all
      await supabase.from("order_items").delete().eq("order_id", id);
      const { error: insErr } = await supabase.from("order_items").insert(
        items.map((it) => ({
          order_id: id,
          product_name: it.product_name,
          variant: it.variant ?? null,
          supplier: it.supplier ?? null,
          quantity: it.quantity ?? 1,
          unit_price: it.unit_price ?? null,
          supplier_unit_cost: it.supplier_unit_cost ?? null,
        }))
      );
      if (insErr) {
        console.error("[updateOrder] order_items replace error:", insErr.code, insErr.message);
        throw new Error(insErr.message || "Échec de la mise à jour des produits.");
      }
    } else if (
      updates.product_name !== undefined ||
      updates.client_price !== undefined ||
      updates.supplier_price !== undefined ||
      updates.quantity !== undefined
    ) {
      // Simple mode: update the first (and presumably only) order_items row
      const { data: existing } = await supabase
        .from("order_items")
        .select("id")
        .eq("order_id", id)
        .order("created_at", { ascending: true })
        .limit(1)
        .single();

      if (existing) {
        const itemUpdates: Record<string, unknown> = {};
        if (updates.product_name !== undefined) itemUpdates.product_name = updates.product_name;
        if (updates.client_price !== undefined) itemUpdates.unit_price = updates.client_price;
        if (updates.supplier_price !== undefined) itemUpdates.supplier_unit_cost = updates.supplier_price;
        if (updates.quantity !== undefined) itemUpdates.quantity = updates.quantity;

        if (Object.keys(itemUpdates).length > 0) {
          await supabase.from("order_items").update(itemUpdates).eq("id", existing.id);
        }
      }
    }

    cacheInvalidatePrefix(PREFIX);
    await load();
  }

  async function deleteOrder(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("orders").delete().eq("id", id);
    if (error) {
      console.error("[deleteOrder] delete error:", error.code, error.message);
      throw new Error(error.message || "Échec de la suppression de la commande.");
    }
    cacheInvalidatePrefix(PREFIX);
    await load();
  }

  return { orders, loading, addOrder, updateOrder, deleteOrder, reload: load };
}
