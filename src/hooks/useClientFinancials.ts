"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Transaction, SharedFeeAllocation, ClientFinancials } from "@/lib/supabase/types";
import { cacheGet, cacheSet } from "@/lib/cache";

const CLIENT_TX_PREFIX = "client_tx";
const CLIENT_ALLOC_PREFIX = "client_alloc";

/**
 * Computes financial summary for one client from their transactions.
 */
export function computeClientFinancials(
  clientId: string,
  transactions: Transaction[],
  allocations: SharedFeeAllocation[]
): ClientFinancials {
  let totalReceived = 0;
  let totalProductCost = 0;
  let totalFees = 0;
  let totalRefunded = 0;
  let totalProfitValidated = 0;

  for (const tx of transactions) {
    const amt = Number(tx.amount);
    switch (tx.sub_type) {
      case "client_money_received":   totalReceived += amt; break;
      case "client_product_purchase": totalProductCost += amt; break;
      case "client_shipping_fee":     totalFees += amt; break;
      case "client_refund":           totalRefunded += amt; break;
      case "profit_validated":        totalProfitValidated += amt; break;
    }
  }

  for (const alloc of allocations) {
    totalFees += Number(alloc.allocated_amount);
  }

  const balance =
    totalReceived - totalProductCost - totalFees - totalRefunded - totalProfitValidated;

  const currencies = transactions
    .filter((t) => t.client_id === clientId)
    .map((t) => t.currency);
  const currency = currencies[0] ?? "USD";

  return {
    clientId,
    currency,
    totalReceived,
    totalProductCost,
    totalFees,
    totalRefunded,
    totalProfitValidated,
    balance,
  };
}

/**
 * Loads financial data for all clients at once (single DB round-trip).
 * Returns a map: clientId → ClientFinancials
 */
export function useAllClientFinancials() {
  const [financials, setFinancials] = useState<Record<string, ClientFinancials>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const cacheKey = "all_client_financials";
    const cached = cacheGet<Record<string, ClientFinancials>>(cacheKey);
    if (cached) {
      setFinancials(cached);
      setLoading(false);
      return;
    }

    const supabase = createClient();

    const [txRes, allocRes] = await Promise.all([
      supabase
        .from("transactions")
        .select("*")
        .in("sub_type", [
          "client_money_received",
          "client_product_purchase",
          "client_shipping_fee",
          "client_refund",
          "profit_validated",
        ])
        .not("client_id", "is", null),
      supabase.from("shared_fee_allocations").select("*").not("client_id", "is", null),
    ]);

    const txList: Transaction[] = (txRes.data as Transaction[]) ?? [];
    const allocList: SharedFeeAllocation[] =
      (allocRes.data as SharedFeeAllocation[]) ?? [];

    // Group by client
    const clientIds = [...new Set(txList.map((t) => t.client_id!).filter(Boolean))];
    const result: Record<string, ClientFinancials> = {};

    for (const clientId of clientIds) {
      const clientTx = txList.filter((t) => t.client_id === clientId);
      const clientAlloc = allocList.filter((a) => a.client_id === clientId);
      result[clientId] = computeClientFinancials(clientId, clientTx, clientAlloc);
    }

    cacheSet(cacheKey, result);
    setFinancials(result);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { financials, loading, reload: load };
}

/**
 * Loads financial data for a single client with their transactions.
 */
export function useClientFinancials(clientId: string) {
  const [data, setData] = useState<ClientFinancials | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!clientId) return;

    const txKey = `${CLIENT_TX_PREFIX}:${clientId}`;
    const allocKey = `${CLIENT_ALLOC_PREFIX}:${clientId}`;

    const cachedTx = cacheGet<Transaction[]>(txKey);
    const cachedAlloc = cacheGet<SharedFeeAllocation[]>(allocKey);

    let txList: Transaction[];
    let allocList: SharedFeeAllocation[];

    if (cachedTx && cachedAlloc) {
      txList = cachedTx;
      allocList = cachedAlloc;
    } else {
      const supabase = createClient();
      const [txRes, allocRes] = await Promise.all([
        supabase.from("transactions").select("*").eq("client_id", clientId)
          .order("transaction_date", { ascending: false }),
        supabase.from("shared_fee_allocations").select("*").eq("client_id", clientId),
      ]);
      txList = (txRes.data as Transaction[]) ?? [];
      allocList = (allocRes.data as SharedFeeAllocation[]) ?? [];
      cacheSet(txKey, txList);
      cacheSet(allocKey, allocList);
    }

    setTransactions(txList);
    setData(computeClientFinancials(clientId, txList, allocList));
    setLoading(false);
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, transactions, loading, reload: load };
}
