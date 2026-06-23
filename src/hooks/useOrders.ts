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
    const { error } = await supabase.from("orders").insert({
      user_id: userId, client_id: clientId, product_name: productName, currency,
      client_price: clientPrice, supplier_price: supplierPrice,
      advance_received: advanceReceived, status, quantity,
      tracking_code: trackingCode,
      next_action: nextAction, note, last_update: new Date().toISOString().split("T")[0],
    });
    if (error) {
      console.error("[addOrder] insert error:", error.code, error.message);
      throw new Error(error.message || "Échec de la création de la commande.");
    }
    cacheInvalidatePrefix(PREFIX);
    await load();
  }

  async function updateOrder(
    id: string,
    updates: Partial<Omit<Order, "id" | "user_id" | "created_at">>
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
