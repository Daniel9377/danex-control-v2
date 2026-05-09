"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Transaction, TransactionType } from "@/lib/supabase/types";
import { cacheGet, cacheSet, cacheInvalidate, cacheInvalidatePrefix } from "@/lib/cache";

const PREFIX = "transactions";

export function useTransactions(accountId?: string) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const key = accountId ? `${PREFIX}:${accountId}` : `${PREFIX}:all`;
    const cached = cacheGet<Transaction[]>(key);
    if (cached) {
      setTransactions(cached);
      setLoading(false);
      return;
    }
    const supabase = createClient();
    let query = supabase
      .from("transactions")
      .select("*")
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (accountId) query = query.eq("account_id", accountId);
    const { data } = await query;
    if (data) {
      cacheSet(key, data);
      setTransactions(data);
    }
    setLoading(false);
  }, [accountId]);

  useEffect(() => {
    load();
  }, [load]);

  async function addTransaction(
    userId: string,
    accountId: string,
    type: TransactionType,
    amount: number,
    currency: string,
    category: string | null,
    note: string | null,
    date: string
  ) {
    const supabase = createClient();
    await supabase.from("transactions").insert({
      user_id: userId, account_id: accountId, type, amount, currency,
      category, note, transaction_date: date,
    });
    const delta = type === "income" ? amount : -amount;
    const { data: acc } = await supabase.from("accounts").select("balance").eq("id", accountId).single();
    if (acc) {
      await supabase.from("accounts").update({ balance: Number(acc.balance) + delta }).eq("id", accountId);
    }
    cacheInvalidatePrefix(PREFIX);
    cacheInvalidate("accounts");
    await load();
  }

  async function deleteTransaction(id: string, accountId: string, type: TransactionType, amount: number) {
    const supabase = createClient();
    await supabase.from("transactions").delete().eq("id", id);
    const delta = type === "income" ? -amount : amount;
    const { data: acc } = await supabase.from("accounts").select("balance").eq("id", accountId).single();
    if (acc) {
      await supabase.from("accounts").update({ balance: Number(acc.balance) + delta }).eq("id", accountId);
    }
    cacheInvalidatePrefix(PREFIX);
    cacheInvalidate("accounts");
    await load();
  }

  return { transactions, loading, addTransaction, deleteTransaction, reload: load };
}
