"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Transaction, TransactionType, AccountingType } from "@/lib/supabase/types";
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

  /**
   * Add a transaction and update the account balance atomically.
   * Reads the current balance first so we can store balance_after on the record.
   */
  async function addTransaction(
    userId: string,
    acctId: string,
    type: TransactionType,
    amount: number,
    currency: string,
    category: string | null,
    note: string | null,
    date: string,
    accountingType: AccountingType | null = null
  ) {
    const supabase = createClient();

    // Read current balance before modification
    const { data: acc } = await supabase
      .from("accounts")
      .select("balance")
      .eq("id", acctId)
      .single();

    const currentBalance = acc ? Number(acc.balance) : 0;
    const delta = type === "income" ? amount : -amount;
    const balanceAfter = currentBalance + delta;

    // Insert transaction with balance snapshot
    await supabase.from("transactions").insert({
      user_id: userId,
      account_id: acctId,
      type,
      amount,
      currency,
      category,
      note,
      transaction_date: date,
      accounting_type: accountingType,
      balance_after: balanceAfter,
    });

    // Update account balance
    await supabase.from("accounts").update({ balance: balanceAfter }).eq("id", acctId);

    cacheInvalidatePrefix(PREFIX);
    cacheInvalidate("accounts");
    await load();
  }

  /**
   * Delete a transaction and reverse its effect on the account balance.
   */
  async function deleteTransaction(
    id: string,
    acctId: string,
    type: TransactionType,
    amount: number
  ) {
    const supabase = createClient();
    await supabase.from("transactions").delete().eq("id", id);

    const { data: acc } = await supabase
      .from("accounts")
      .select("balance")
      .eq("id", acctId)
      .single();

    if (acc) {
      // Reverse the original delta
      const reversal = type === "income" ? -amount : amount;
      await supabase
        .from("accounts")
        .update({ balance: Number(acc.balance) + reversal })
        .eq("id", acctId);
    }

    cacheInvalidatePrefix(PREFIX);
    cacheInvalidate("accounts");
    await load();
  }

  /**
   * Add a balance adjustment / reconciliation entry.
   * Sets the account balance to the specified target and records
   * an "adjustment" transaction for audit purposes.
   * This is NOT counted as real income or real expense in statistics.
   */
  async function addAdjustment(
    userId: string,
    acctId: string,
    currency: string,
    targetBalance: number,
    note: string | null,
    date: string
  ) {
    const supabase = createClient();

    const { data: acc } = await supabase
      .from("accounts")
      .select("balance")
      .eq("id", acctId)
      .single();

    if (!acc) return;

    const currentBalance = Number(acc.balance);
    const difference = targetBalance - currentBalance;

    if (Math.abs(difference) < 0.001) return; // Already correct

    const type: TransactionType = difference > 0 ? "income" : "expense";
    const amount = Math.abs(difference);

    await supabase.from("transactions").insert({
      user_id: userId,
      account_id: acctId,
      type,
      amount,
      currency,
      category: "Correction de solde",
      note: note || "Ajustement de solde",
      transaction_date: date,
      accounting_type: "adjustment",
      balance_after: targetBalance,
    });

    await supabase.from("accounts").update({ balance: targetBalance }).eq("id", acctId);

    cacheInvalidatePrefix(PREFIX);
    cacheInvalidate("accounts");
    await load();
  }

  return { transactions, loading, addTransaction, deleteTransaction, addAdjustment, reload: load };
}
