"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Client, TrustLevel } from "@/lib/supabase/types";

export function useClients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("clients")
      .select("*")
      .order("name");
    if (data) setClients(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addClient(
    userId: string,
    name: string,
    phone: string | null,
    country: string | null,
    city: string | null,
    trustLevel: TrustLevel,
    note: string | null
  ) {
    const supabase = createClient();
    await supabase.from("clients").insert({
      user_id: userId,
      name,
      phone,
      country,
      city,
      trust_level: trustLevel,
      note,
    });
    await load();
  }

  async function updateClient(
    id: string,
    updates: Partial<Omit<Client, "id" | "user_id" | "created_at">>
  ) {
    const supabase = createClient();
    await supabase.from("clients").update(updates).eq("id", id);
    await load();
  }

  async function deleteClient(id: string) {
    const supabase = createClient();
    await supabase.from("clients").delete().eq("id", id);
    await load();
  }

  return { clients, loading, addClient, updateClient, deleteClient, reload: load };
}
