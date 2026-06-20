import { createAdminClient } from "@/lib/supabase/admin";

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
  created_at?: string;
};

const MAX_HISTORY = 5;

export type ConversationHistoryResult = {
  messages: ConversationMessage[];
  summary: string | null;
};

export async function getConversationHistory(userId: string): Promise<ConversationHistoryResult> {
  const supabase = createAdminClient();

  const [messagesResult, summaryResult] = await Promise.all([
    supabase
      .from("mindboost_conversation")
      .select("role, content, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(MAX_HISTORY),
    supabase
      .from("mindboost_conversation_summary")
      .select("summary")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single(),
  ]);

  if (messagesResult.error) {
    console.error("Error fetching conversation history:", messagesResult.error.message);
    return { messages: [], summary: null };
  }

  const messages = ((messagesResult.data ?? []) as ConversationMessage[]).reverse();
  const summary = summaryResult.data?.summary ?? null;

  return { messages, summary };
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

  // Keep only the 20 latest messages
  const { data } = await supabase
    .from("mindboost_conversation")
    .select("id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (data && data.length > 20) {
    const toDelete = data.slice(20).map((d: { id: string }) => d.id);
    const { error: delErr } = await supabase.from("mindboost_conversation").delete().in("id", toDelete);
    if (delErr) {
      console.error("[saveConversationMessage] prune error:", delErr.code, delErr.message);
    }
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
