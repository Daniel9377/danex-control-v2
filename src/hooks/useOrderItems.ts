"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { OrderItem } from "@/lib/supabase/types";

/**
 * Reads and writes order_items rows for a single order.
 *
 * Each order MUST have at least 1 order_items row (guaranteed by migration 004
 * and enforced by the application).  The hook does NOT touch computeOrderCosts
 * — that remains transaction-based and unchanged.
 */

export function useOrderItems() {
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(false);

  /** Load all items for a given order. */
  const loadItems = useCallback(async (orderId: string): Promise<OrderItem[]> => {
    setLoading(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("order_items")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[loadItems] error:", error.code, error.message);
      throw new Error(error.message || "Échec du chargement des produits.");
    }
    const result = (data ?? []) as OrderItem[];
    setItems(result);
    setLoading(false);
    return result;
  }, []);

  /** Add a single item to an order. Returns the created row. */
  const addItem = useCallback(async (
    orderId: string,
    item: {
      product_name: string;
      variant?: string | null;
      supplier?: string | null;
      quantity?: number;
      unit_price?: number | null;
      supplier_unit_cost?: number | null;
    }
  ): Promise<OrderItem> => {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("order_items")
      .insert({
        order_id: orderId,
        product_name: item.product_name,
        variant: item.variant ?? null,
        supplier: item.supplier ?? null,
        quantity: item.quantity ?? 1,
        unit_price: item.unit_price ?? null,
        supplier_unit_cost: item.supplier_unit_cost ?? null,
      })
      .select()
      .single();

    if (error) {
      console.error("[addItem] error:", error.code, error.message);
      throw new Error(error.message || "Échec de l'ajout du produit.");
    }
    setItems((prev) => [...prev, data as OrderItem]);
    return data as OrderItem;
  }, []);

  /** Update an existing item. */
  const updateItem = useCallback(async (
    itemId: string,
    updates: Partial<Pick<OrderItem, "product_name" | "variant" | "supplier" | "quantity" | "unit_price" | "supplier_unit_cost">>
  ) => {
    const supabase = createClient();
    const { error } = await supabase
      .from("order_items")
      .update(updates)
      .eq("id", itemId);

    if (error) {
      console.error("[updateItem] error:", error.code, error.message);
      throw new Error(error.message || "Échec de la mise à jour du produit.");
    }
    setItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, ...updates } : it))
    );
  }, []);

  /** Delete an item. Refuses if it's the last item for the order. */
  const deleteItem = useCallback(async (itemId: string, orderId: string) => {
    // Guard: every order must have at least 1 item
    const current = items.length > 0 ? items : await loadItems(orderId);
    if (current.length <= 1) {
      throw new Error("Une commande doit avoir au moins un produit.");
    }

    const supabase = createClient();
    const { error } = await supabase
      .from("order_items")
      .delete()
      .eq("id", itemId);

    if (error) {
      console.error("[deleteItem] error:", error.code, error.message);
      throw new Error(error.message || "Échec de la suppression du produit.");
    }
    setItems((prev) => prev.filter((it) => it.id !== itemId));
  }, [items, loadItems]);

  /** Replace ALL items for an order (used when saving a form). */
  const replaceItems = useCallback(async (
    orderId: string,
    newItems: {
      product_name: string;
      variant?: string | null;
      supplier?: string | null;
      quantity?: number;
      unit_price?: number | null;
      supplier_unit_cost?: number | null;
    }[]
  ) => {
    if (newItems.length === 0) {
      throw new Error("Une commande doit avoir au moins un produit.");
    }

    const supabase = createClient();

    // Delete existing items
    const { error: delErr } = await supabase
      .from("order_items")
      .delete()
      .eq("order_id", orderId);

    if (delErr) {
      console.error("[replaceItems] delete error:", delErr.code, delErr.message);
      throw new Error(delErr.message || "Échec de la mise à jour des produits.");
    }

    // Insert new items
    const rows = newItems.map((it) => ({
      order_id: orderId,
      product_name: it.product_name,
      variant: it.variant ?? null,
      supplier: it.supplier ?? null,
      quantity: it.quantity ?? 1,
      unit_price: it.unit_price ?? null,
      supplier_unit_cost: it.supplier_unit_cost ?? null,
    }));

    const { data, error: insErr } = await supabase
      .from("order_items")
      .insert(rows)
      .select();

    if (insErr) {
      console.error("[replaceItems] insert error:", insErr.code, insErr.message);
      throw new Error(insErr.message || "Échec de l'enregistrement des produits.");
    }

    setItems((data ?? []) as OrderItem[]);
  }, []);

  return { items, loading, loadItems, addItem, updateItem, deleteItem, replaceItems };
}

/**
 * Computes the expected margin from order_items rows.
 *
 * Formula: Σ (unit_price × quantity) − Σ (supplier_unit_cost × quantity)
 *
 * Works for 1 item (Simple mode) and N items (Detailed mode) — no branching.
 * Returns null if no items or all prices are null.
 *
 * IMPORTANT: this is the THEORETICAL margin based on entered prices.
 * computeOrderCosts() is the REAL profit based on actual transactions.
 * Do not confuse the two.
 */
export function computeExpectedMargin(items: Pick<OrderItem, "quantity" | "unit_price" | "supplier_unit_cost">[]): number | null {
  let totalClient = 0;
  let totalSupplier = 0;
  let hasAnyPrice = false;

  for (const it of items) {
    const cp = Number(it.unit_price ?? 0);
    const sp = Number(it.supplier_unit_cost ?? 0);
    const qty = it.quantity ?? 1;
    totalClient += cp * qty;
    totalSupplier += sp * qty;
    if (cp > 0 || sp > 0) hasAnyPrice = true;
  }

  if (!hasAnyPrice) return null;
  return totalClient - totalSupplier;
}
