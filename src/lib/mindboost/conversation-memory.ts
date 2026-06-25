import { createAdminClient } from "@/lib/supabase/admin";
import { getChinaDateISO } from "@/lib/mindboost/time";

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
  created_at?: string;
};

export type ConversationHistoryResult = {
  messages: ConversationMessage[];
  summary: string | null; // cumulative daily summaries log
};

export async function getConversationHistory(userId: string): Promise<ConversationHistoryResult> {
  const supabase = createAdminClient();
  const todayChina = getChinaDateISO();

  // 1. Raw messages from today only (China date)
  const { data: todayMessages, error: msgError } = await supabase
    .from("mindboost_conversation")
    .select("role, content, created_at")
    .eq("user_id", userId)
    .gte("created_at", `${todayChina}T00:00:00+08:00`)
    .order("created_at", { ascending: true });

  if (msgError) {
    console.error("Error fetching conversation history:", msgError.message);
    return { messages: [], summary: null };
  }

  // 2. Cumulative daily summary log (all past days)
  const { data: summaries } = await supabase
    .from("mindboost_daily_summary")
    .select("summary_date, summary")
    .eq("user_id", userId)
    .order("summary_date", { ascending: true });

  const summaryLog = summaries?.length
    ? summaries.map((s: any) => `[${s.summary_date}] ${s.summary}`).join("\n")
    : null;

  return {
    messages: (todayMessages ?? []) as ConversationMessage[],
    summary: summaryLog,
  };
}

export async function saveConversationSummary(
  userId: string,
  summary: string
): Promise<void> {
  const supabase = createAdminClient();

  const { error: insertErr } = await supabase.from("mindboost_conversation_summary").insert({
    user_id: userId,
    summary,
    created_at: new Date().toISOString(),
  });
  if (insertErr) {
    console.error("[saveConversationSummary] insert error:", insertErr.code, insertErr.message);
    // Non-fatal: degrades long-term memory but doesn't break current conversation
    return;
  }

  // Keep only the 5 latest summaries
  const { data } = await supabase
    .from("mindboost_conversation_summary")
    .select("id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (data && data.length > 5) {
    const toDelete = data.slice(5).map((d: { id: string }) => d.id);
    const { error: delErr } = await supabase.from("mindboost_conversation_summary").delete().in("id", toDelete);
    if (delErr) {
      console.error("[saveConversationSummary] prune error:", delErr.code, delErr.message);
      // Non-fatal: storage bloat only
    }
  }
}

export async function saveConversationMessage(
  userId: string,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  const supabase = createAdminClient();

  const { error: insertErr } = await supabase.from("mindboost_conversation").insert({
    user_id: userId,
    role,
    content,
    created_at: new Date().toISOString(),
  });
  if (insertErr) {
    console.error("[saveConversationMessage] insert error:", insertErr.code, insertErr.message);
    // Non-fatal: bot has already generated its response, only short-term memory affected
    return;
  }
  // Messages retained indefinitely — no pruning.
  // Daily summaries (mindboost_daily_summary) provide long-term memory;
  // date-based filtering in getConversationHistory() limits context to today.
}

// ── Daily summaries (mindboost_daily_summary) ─────────────────────────────

export async function upsertDailySummary(
  userId: string,
  summaryDate: string,
  summaryText: string
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("mindboost_daily_summary").upsert({
    user_id: userId,
    summary_date: summaryDate,
    summary: summaryText,
    created_at: new Date().toISOString(),
  }, { onConflict: "user_id,summary_date" });
  if (error) {
    console.error("[upsertDailySummary] error:", error.code, error.message);
    throw new Error("Échec de la sauvegarde du résumé quotidien.");
  }
}

export async function getDailySummaries(
  userId: string
): Promise<Array<{ summary_date: string; summary: string }>> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("mindboost_daily_summary")
    .select("summary_date, summary")
    .eq("user_id", userId)
    .order("summary_date", { ascending: true });
  return (data ?? []) as Array<{ summary_date: string; summary: string }>;
}

// ── Mention escalation tiers ──────────────────────────────────────────────

export function formatMentionLine(mention: { person_name: string; description: string; created_at: string }): string {
  const ageDays = Math.floor((Date.now() - new Date(mention.created_at).getTime()) / 86400000);
  const desc = mention.description.slice(0, 100);

  if (ageDays <= 1) {
    // Tier 0: neutral
    return `○ ${mention.person_name} — ${desc}`;
  } else if (ageDays <= 3) {
    // Tier 1: firmer
    return `⚠ ${mention.person_name} (${ageDays}j) — ${desc} — Tu le fais quand ?`;
  } else {
    // Tier 2: insistent — Daniel explicitly asked to be pushed hard
    return `🚨 ${mention.person_name} (${ageDays}j) — Tu m'as dit de te pousser à fond. ${desc}. Fais-le aujourd'hui.`;
  }
}

// --- Parking list ---

export async function saveParkingListItem(userId: string, idea: string): Promise<void> {
  const supabase = createAdminClient();
  const key = `parking_list_${Date.now()}`;
  const { error } = await supabase.from("mindboost_memory").insert({
    user_id: userId,
    memory_type: key,
    content: JSON.stringify({ idea, saved_at: new Date().toISOString(), status: "pending" }),
    relevance_score: 1,
    expires_at: null,
  });
  if (error) {
    console.error("[saveParkingListItem] insert error:", error.code, error.message);
    // The bot already told the user it saved the idea. This is a lie if we fail.
    // However, the bot response was already sent — we can't retract it.
    // Throw so the caller (decision-engine) can log the failure; the user may
    // notice the idea is missing later.
    throw new Error("Impossible de sauvegarder l'idée dans la parking list.");
  }
}

export async function getParkingList(
  userId: string
): Promise<Array<{ idea: string; saved_at: string }>> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("mindboost_memory")
    .select("content")
    .eq("user_id", userId)
    .like("memory_type", "parking_list_%")
    .order("created_at", { ascending: true });

  return (data ?? [])
    .map((row) => {
      try {
        return JSON.parse(row.content as string) as { idea: string; saved_at: string };
      } catch {
        return null;
      }
    })
    .filter((item): item is { idea: string; saved_at: string } => item !== null);
}

// --- Evening check pending ---

export async function saveEveningCheckPending(userId: string): Promise<void> {
  const supabase = createAdminClient();
  const endOfDay = new Date();
  endOfDay.setUTCHours(23, 59, 59, 999);
  const { error } = await supabase.from("mindboost_memory").upsert(
    {
      user_id: userId,
      memory_type: "evening_check_pending",
      content: JSON.stringify({ asked_at: new Date().toISOString() }),
      relevance_score: 1,
      expires_at: endOfDay.toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,memory_type" }
  );
  if (error) {
    console.error("[saveEveningCheckPending] upsert error:", error.code, error.message);
    // Non-fatal: may cause duplicate evening check question, annoying but not destructive
  }
}

export async function getEveningCheckPending(
  userId: string
): Promise<{ asked_at: string } | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("mindboost_memory")
    .select("content, expires_at")
    .eq("user_id", userId)
    .eq("memory_type", "evening_check_pending")
    .single();
  if (!data) return null;
  if (data.expires_at && new Date(data.expires_at as string) < new Date()) return null;
  try {
    return JSON.parse(data.content as string) as { asked_at: string };
  } catch {
    return null;
  }
}

export async function deleteEveningCheckPending(userId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("mindboost_memory")
    .delete()
    .eq("user_id", userId)
    .eq("memory_type", "evening_check_pending");
  if (error) {
    console.error("[deleteEveningCheckPending] delete error:", error.code, error.message);
    // Non-fatal: flag stays set, next cycle may think check is still pending
  }
}

// --- Loop flag (anti-loop detection) ---

export async function getLoopCount(userId: string): Promise<number> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("mindboost_memory")
    .select("content")
    .eq("user_id", userId)
    .eq("memory_type", "loop_flag")
    .single();

  if (!data?.content) return 0;
  try {
    return (JSON.parse(data.content as string) as { count: number }).count ?? 0;
  } catch {
    return 0;
  }
}

export async function incrementLoopCount(userId: string): Promise<number> {
  const supabase = createAdminClient();
  const current = await getLoopCount(userId);
  const newCount = current + 1;
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from("mindboost_memory").upsert(
    {
      user_id: userId,
      memory_type: "loop_flag",
      content: JSON.stringify({ count: newCount, last_updated: new Date().toISOString() }),
      relevance_score: 1,
      expires_at: expires,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,memory_type" }
  );
  if (error) {
    console.error("[incrementLoopCount] upsert error:", error.code, error.message);
    // Safety mechanism silently disabled — throw so the caller knows
    throw new Error("Échec de la protection anti-boucle.");
  }

  return newCount;
}

export async function resetLoopCount(userId: string): Promise<void> {
  const supabase = createAdminClient();
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase.from("mindboost_memory").upsert(
    {
      user_id: userId,
      memory_type: "loop_flag",
      content: JSON.stringify({ count: 0, last_updated: new Date().toISOString() }),
      relevance_score: 1,
      expires_at: expires,
    },
    { onConflict: "user_id,memory_type" }
  );
  if (error) {
    console.error("[resetLoopCount] upsert error:", error.code, error.message);
    // Non-fatal but may cause the bot to stay in forced-binary mode
    throw new Error("Échec de la réinitialisation du compteur de boucle.");
  }
}
