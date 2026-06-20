"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Transfer } from "@/lib/supabase/types";
import { cacheGet, cacheSet, cacheInvalidate } from "@/lib/cache";

const KEY = "transfers";

export function useTransfers() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const cached = cacheGet<Transfer[]>(KEY);
    if (cached) {
      setTransfers(cached);
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const { data, error } = await supabase
      .from("transfers")
      .select("*")
      .order("transfer_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) {
      console.error("[useTransfers] load error:", error.code, error.message);
    }
    if (data) {
      cacheSet(KEY, data);
      setTransfers(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addTransfer(
    userId: string,
    fromAccountId: string,
    toAccountId: string,
    fromAmount: number,
    toAmount: number,
    fromCurrency: string,
    toCurrency: string,
    exchangeRate: number,
    date: string,
    note: string | null
  ) {
    const supabase = createClient();
    const { error: insertError } = await supabase.from("transfers").insert({
      user_id: userId, from_account_id: fromAccountId, to_account_id: toAccountId,
      from_amount: fromAmount, to_amount: toAmount, from_currency: fromCurrency,
      to_currency: toCurrency, exchange_rate: exchangeRate, transfer_date: date, note,
    });
    if (insertError) {
      console.error("[addTransfer] insert error:", insertError.code, insertError.message);
      throw new Error(insertError.message || "Échec de la création du transfert.");
    }

    const { data: fromAcc, error: fromFetchErr } = await supabase
      .from("accounts").select("balance").eq("id", fromAccountId).single();
    if (fromFetchErr) {
      console.error("[addTransfer] from-account fetch error:", fromFetchErr.code, fromFetchErr.message);
      throw new Error("Impossible de lire le solde du compte source.");
    }
    if (fromAcc) {
      const { error: debitErr } = await supabase
        .from("accounts")
        .update({ balance: Number(fromAcc.balance) - fromAmount })
        .eq("id", fromAccountId);
      if (debitErr) {
        console.error("[addTransfer] debit error:", debitErr.code, debitErr.message);
        throw new Error(debitErr.message || "Échec du débit du compte source.");
      }
    }

    const { data: toAcc, error: toFetchErr } = await supabase
      .from("accounts").select("balance").eq("id", toAccountId).single();
    if (toFetchErr) {
      console.error("[addTransfer] to-account fetch error:", toFetchErr.code, toFetchErr.message);
      throw new Error("Impossible de lire le solde du compte destination.");
    }
    if (toAcc) {
      const { error: creditErr } = await supabase
        .from("accounts")
        .update({ balance: Number(toAcc.balance) + toAmount })
        .eq("id", toAccountId);
      if (creditErr) {
        console.error("[addTransfer] credit error:", creditErr.code, creditErr.message);
        throw new Error(creditErr.message || "Échec du crédit du compte destination.");
      }
    }

    cacheInvalidate(KEY, "accounts");
    await load();
  }

  return { transfers, loading, addTransfer, reload: load };
}
