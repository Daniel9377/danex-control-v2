"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Order, OrderStatus } from "@/lib/supabase/types";

export function useOrders(clientId?: string) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();
    let query = supabase
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });
    if (clientId) query = query.eq("client_id", clientId);
    const { data } = await query;
    if (data) setOrders(data);
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
    trackingCode: string | null,
    nextAction: string | null,
    note: string | null
  ) {
    const supabase = createClient();
    await supabase.from("orders").insert({
      user_id: userId,
      client_id: clientId,
      product_name: productName,
      currency,
      client_price: clientPrice,
      supplier_price: supplierPrice,
      advance_received: advanceReceived,
      status,
      tracking_code: trackingCode,
      next_action: nextAction,
      note,
      last_update: new Date().toISOString().split("T")[0],
    });
    await load();
  }

  async function updateOrder(
    id: string,
    updates: Partial<Omit<Order, "id" | "user_id" | "created_at">>
  ) {
    const supabase = createClient();
    await supabase
      .from("orders")
      .update({ ...updates, last_update: new Date().toISOString().split("T")[0] })
      .eq("id", id);
    await load();
  }

  async function deleteOrder(id: string) {
    const supabase = createClient();
    await supabase.from("orders").delete().eq("id", id);
    await load();
  }

  return { orders, loading, addOrder, updateOrder, deleteOrder, reload: load };
}
