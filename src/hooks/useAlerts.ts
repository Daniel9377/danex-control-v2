"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Alert } from "@/lib/supabase/types";
import { cacheGet, cacheSet, cacheInvalidate } from "@/lib/cache";

const KEY = "alerts";

export function useAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const cached = cacheGet<Alert[]>(KEY);
    if (cached) {
      setAlerts(cached);
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const { data } = await supabase
      .from("alerts")
      .select("*")
      .order("triggered_at", { ascending: false });
    if (data) {
      cacheSet(KEY, data);
      setAlerts(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function markRead(id: string) {
    const supabase = createClient();
    await supabase.from("alerts").update({ is_read: true }).eq("id", id);
    cacheInvalidate(KEY);
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, is_read: true } : a)));
  }

  async function markAllRead() {
    const supabase = createClient();
    await supabase.from("alerts").update({ is_read: true }).eq("is_read", false);
    cacheInvalidate(KEY);
    setAlerts((prev) => prev.map((a) => ({ ...a, is_read: true })));
  }

  const unreadCount = alerts.filter((a) => !a.is_read).length;

  return { alerts, loading, unreadCount, markRead, markAllRead, reload: load };
}
