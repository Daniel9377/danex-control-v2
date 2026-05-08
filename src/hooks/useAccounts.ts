"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Account, AccountType } from "@/lib/supabase/types";

export function useAccounts() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("accounts")
      .select("*")
      .order("created_at");
    if (data) setAccounts(data);
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
    note: string | null
  ) {
    const supabase = createClient();
    await supabase.from("accounts").insert({
      user_id: userId,
      name,
      type,
      currency,
      balance,
      note,
    });
    await load();
  }

  async function updateAccount(
    id: string,
    updates: Partial<Pick<Account, "name" | "type" | "currency" | "note">>
  ) {
    const supabase = createClient();
    await supabase.from("accounts").update(updates).eq("id", id);
    await load();
  }

  async function deleteAccount(id: string) {
    const supabase = createClient();
    await supabase.from("accounts").delete().eq("id", id);
    await load();
  }

  return { accounts, loading, addAccount, updateAccount, deleteAccount, reload: load };
}
