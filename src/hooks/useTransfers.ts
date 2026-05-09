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
    const { data } = await supabase
      .from("transfers")
      .select("*")
      .order("transfer_date", { ascending: false })
      .order("created_at", { ascending: false });
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
    await supabase.from("transfers").insert({
      user_id: userId, from_account_id: fromAccountId, to_account_id: toAccountId,
      from_amount: fromAmount, to_amount: toAmount, from_currency: fromCurrency,
      to_currency: toCurrency, exchange_rate: exchangeRate, transfer_date: date, note,
    });
    const { data: fromAcc } = await supabase.from("accounts").select("balance").eq("id", fromAccountId).single();
    const { data: toAcc } = await supabase.from("accounts").select("balance").eq("id", toAccountId).single();
    if (fromAcc) {
      await supabase.from("accounts").update({ balance: Number(fromAcc.balance) - fromAmount }).eq("id", fromAccountId);
    }
    if (toAcc) {
      await supabase.from("accounts").update({ balance: Number(toAcc.balance) + toAmount }).eq("id", toAccountId);
    }
    cacheInvalidate(KEY, "accounts");
    await load();
  }

  return { transfers, loading, addTransfer, reload: load };
}
