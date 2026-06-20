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
    const { data, error } = await supabase
      .from("accounts")
      .select("*")
      .order("created_at");
    if (error) {
      console.error("[useAccounts] load error:", error.code, error.message);
    }
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
    availability: AccountAvailability = "immediate"
  ) {
    const supabase = createClient();
    const payload = {
      user_id: userId,
      name,
      type,
      currency,
      balance,
      note,
      availability,
    };

    const { error } = await supabase.from("accounts").insert(payload);

    if (error) {
      console.error("[addAccount] error:", error.code, error.message);
      throw new Error(error.message || "Échec de la création du compte.");
    }

    cacheInvalidate(KEY);
    await load();
  }

  async function updateAccount(
    id: string,
    updates: Partial<Pick<Account, "name" | "type" | "currency" | "note" | "availability">>
  ) {
    const supabase = createClient();
    const { error } = await supabase.from("accounts").update(updates).eq("id", id);

    if (error) {
      console.error("[updateAccount] error:", error.code, error.message);
      throw new Error(error.message || "Échec de la mise à jour du compte.");
    }

    cacheInvalidate(KEY);
    await load();
  }

  async function deleteAccount(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("accounts").delete().eq("id", id);

    if (error) {
      console.error("[deleteAccount] error:", error.code, error.message);
      throw new Error(error.message || "Échec de la suppression du compte.");
    }

    cacheInvalidate(KEY);
    await load();
  }

  return { accounts, loading, addAccount, updateAccount, deleteAccount, reload: load };
}
