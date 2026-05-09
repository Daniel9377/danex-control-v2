"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Account, AccountType, AccountAvailability } from "@/lib/supabase/types";
import { cacheGet, cacheSet, cacheInvalidate } from "@/lib/cache";

const KEY = "accounts";

export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const cached = cacheGet<Account[]>(KEY);
    if (cached) {
      setAccounts(cached);
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const { data } = await supabase
      .from("accounts")
      .select("*")
      .order("created_at");
    if (data) {
      cacheSet(KEY, data);
      setAccounts(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addAccount(
    userId: string,
    name: string,
    type: AccountType,
    currency: string,
    balance: number,
    note: string | null,
    availability?: AccountAvailability
  ) {
    const supabase = createClient();
    await supabase.from("accounts").insert({
      user_id: userId, name, type, currency, balance, note,
      ...(availability ? { availability } : {}),
    });
    cacheInvalidate(KEY);
    await load();
  }

  async function updateAccount(
    id: string,
    updates: Partial<Pick<Account, "name" | "type" | "currency" | "note" | "availability">>
  ) {
    const supabase = createClient();
    await supabase.from("accounts").update(updates).eq("id", id);
    cacheInvalidate(KEY);
    await load();
  }

  async function deleteAccount(id: string) {
    const supabase = createClient();
    await supabase.from("accounts").delete().eq("id", id);
    cacheInvalidate(KEY);
    await load();
  }

  return { accounts, loading, addAccount, updateAccount, deleteAccount, reload: load };
}
