"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Client, TrustLevel } from "@/lib/supabase/types";
import { cacheGet, cacheSet, cacheInvalidate } from "@/lib/cache";

const KEY = "clients";

export function useClients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const cached = cacheGet<Client[]>(KEY);
    if (cached) {
      setClients(cached);
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const { data } = await supabase.from("clients").select("*").order("name");
    if (data) {
      cacheSet(KEY, data);
      setClients(data);
    }
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
    const { error } = await supabase.from("clients").insert({ user_id: userId, name, phone, country, city, trust_level: trustLevel, note });
    if (error) {
      console.error("[addClient] insert error:", error.code, error.message);
      throw new Error(error.message || "Échec de la création du client.");
    }
    cacheInvalidate(KEY);
    await load();
  }

  async function updateClient(
    id: string,
    updates: Partial<Omit<Client, "id" | "user_id" | "created_at">>
  ) {
    const supabase = createClient();
    const { error } = await supabase.from("clients").update(updates).eq("id", id);
    if (error) {
      console.error("[updateClient] update error:", error.code, error.message);
      throw new Error(error.message || "Échec de la mise à jour du client.");
    }
    cacheInvalidate(KEY);
    await load();
  }

  async function deleteClient(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) {
      console.error("[deleteClient] delete error:", error.code, error.message);
      throw new Error(error.message || "Échec de la suppression du client.");
    }
    cacheInvalidate(KEY);
    await load();
  }

  return { clients, loading, addClient, updateClient, deleteClient, reload: load };
}
