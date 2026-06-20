"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Currency } from "@/lib/supabase/types";
import { DEFAULT_CURRENCIES } from "@/lib/currency";
import { cacheGet, cacheSet, cacheInvalidate } from "@/lib/cache";

const KEY = "currencies";

export function useCurrencies() {
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const cached = cacheGet<Currency[]>(KEY);
    if (cached) {
      setCurrencies(cached);
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const { data } = await supabase.from("currencies").select("*").order("code");
    if (data) {
      cacheSet(KEY, data);
      setCurrencies(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function seedIfEmpty(userId: string) {
    const supabase = createClient();
    const { data } = await supabase.from("currencies").select("id").eq("user_id", userId).limit(1);
    if (data && data.length === 0) {
      const { error } = await supabase.from("currencies").insert(DEFAULT_CURRENCIES.map((c) => ({ ...c, user_id: userId })));
      if (error) {
        console.error("[seedIfEmpty] insert error:", error.code, error.message);
        // Non-fatal: user can manually add currencies later
      }
      cacheInvalidate(KEY);
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
    const { error } = await supabase
      .from("currencies")
      .upsert(
        { user_id: userId, code, name, symbol, rate_to_usd, updated_at: new Date().toISOString() },
        { onConflict: "user_id,code" }
      );
    if (error) {
      console.error("[upsertCurrency] upsert error:", error.code, error.message);
      throw new Error(error.message || "Échec de la mise à jour de la devise.");
    }
    cacheInvalidate(KEY);
    await load();
  }

  const ratesByCode: Record<string, number> = {};
  currencies.forEach((c) => {
    ratesByCode[c.code] = c.rate_to_usd;
  });

  return { currencies, ratesByCode, loading, seedIfEmpty, upsertCurrency, reload: load };
}
