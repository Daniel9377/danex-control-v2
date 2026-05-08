"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Currency } from "@/lib/supabase/types";
import { DEFAULT_CURRENCIES } from "@/lib/currency";

export function useCurrencies() {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("currencies")
      .select("*")
      .order("code");
    if (data) setCurrencies(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function seedIfEmpty(userId: string) {
    const supabase = createClient();
    const { data } = await supabase
      .from("currencies")
      .select("id")
      .eq("user_id", userId)
      .limit(1);
    if (data && data.length === 0) {
      await supabase.from("currencies").insert(
        DEFAULT_CURRENCIES.map((c) => ({ ...c, user_id: userId }))
      );
      await load();
    }
  }

  async function upsertCurrency(
    userId: string,
    code: string,
    name: string,
    symbol: string,
    rate_to_usd: number
  ) {
    const supabase = createClient();
    await supabase
      .from("currencies")
      .upsert(
        { user_id: userId, code, name, symbol, rate_to_usd, updated_at: new Date().toISOString() },
        { onConflict: "user_id,code" }
      );
    await load();
  }

  const ratesByCode: Record<string, number> = {};
  currencies.forEach((c) => {
    ratesByCode[c.code] = c.rate_to_usd;
  });

  return { currencies, ratesByCode, loading, seedIfEmpty, upsertCurrency, reload: load };
}
