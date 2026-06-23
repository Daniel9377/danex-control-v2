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
      // Normalize: quantity defaults to 1 for orders created before migration 003
      const normalized = (data as Order[]).map((o) => ({ ...o, quantity: o.quantity ?? 1 }));
      cacheSet(key, normalized);
      setOrders(normalized);
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
    // Build insert payload — include quantity only if the column exists (migration 003).
    // Once the migration is applied everywhere, this guarded path can be simplified.
    const payload: Record<string, unknown> = {
      user_id: userId, client_id: clientId, product_name: productName, currency,
      client_price: clientPrice, supplier_price: supplierPrice,
      advance_received: advanceReceived, status,
      tracking_code: trackingCode,
      next_action: nextAction, note, last_update: new Date().toISOString().split("T")[0],
    };
    // Try with quantity first; if the column doesn't exist yet, omit it
    try {
      const { error } = await supabase.from("orders").insert({ ...payload, quantity });
      if (error) {
        // If the column doesn't exist (42703), retry without quantity
        if (error.code === "42703" || error.message?.includes("quantity")) {
          const { error: err2 } = await supabase.from("orders").insert(payload);
          if (err2) throw new Error(err2.message);
        } else {
          throw new Error(error.message);
        }
      }
    } catch (err: any) {
      console.error("[addOrder] insert error:", err.message);
      throw new Error(err.message || "Échec de la création de la commande.");
    }
    cacheInvalidatePrefix(PREFIX);
    await load();
  }

  async function updateOrder(
    id: string,
    updates: Partial<Omit<Order, "id" | "user_id" | "created_at">>
  ) {
    const supabase = createClient();
    const payload = { ...updates, last_update: new Date().toISOString().split("T")[0] };
    // If quantity is in the update but the column doesn't exist yet, omit it
    try {
      const { error } = await supabase.from("orders").update(payload).eq("id", id);
      if (error) {
        if (error.code === "42703" || error.message?.includes("quantity")) {
          const { quantity: _, ...rest } = payload as any;
          const { error: err2 } = await supabase.from("orders").update(rest).eq("id", id);
          if (err2) throw new Error(err2.message);
        } else {
          throw new Error(error.message);
        }
      }
    } catch (err: any) {
      console.error("[updateOrder] update error:", err.message);
      throw new Error(err.message || "Échec de la mise à jour de la commande.");
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
