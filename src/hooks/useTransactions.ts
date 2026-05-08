"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Transaction, TransactionType } from "@/lib/supabase/types";

export function useTransactions(accountId?: string) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();
    let query = supabase
      .from("transactions")
      .select("*")
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (accountId) query = query.eq("account_id", accountId);
    const { data } = await query;
    if (data) setTransactions(data);
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
      user_id: userId,
      account_id: accountId,
      type,
      amount,
      currency,
      category,
      note,
      transaction_date: date,
    });
    // Update account balance
    const delta = type === "income" ? amount : -amount;
    const { data: acc } = await supabase
      .from("accounts")
      .select("balance")
      .eq("id", accountId)
      .single();
    if (acc) {
      await supabase
        .from("accounts")
        .update({ balance: Number(acc.balance) + delta })
        .eq("id", accountId);
    }
    await load();
  }

  async function deleteTransaction(id: string, accountId: string, type: TransactionType, amount: number) {
    const supabase = createClient();
    await supabase.from("transactions").delete().eq("id", id);
    // Reverse balance
    const delta = type === "income" ? -amount : amount;
    const { data: acc } = await supabase
      .from("accounts")
      .select("balance")
      .eq("id", accountId)
      .single();
    if (acc) {
      await supabase
        .from("accounts")
        .update({ balance: Number(acc.balance) + delta })
        .eq("id", accountId);
    }
    await load();
  }

  return { transactions, loading, addTransaction, deleteTransaction, reload: load };
}
