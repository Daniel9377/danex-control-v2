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

  await supabase.from("mindboost_conversation_summary").insert({
    user_id: userId,
    summary,
    created_at: new Date().toISOString(),
  });

  // Garder seulement les 5 derniers résumés
  const { data } = await supabase
    .from("mindboost_conversation_summary")
    .select("id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (data && data.length > 5) {
    const toDelete = data.slice(5).map((d: { id: string }) => d.id);
    await supabase.from("mindboost_conversation_summary").delete().in("id", toDelete);
  }
}

export async function saveConversationMessage(
  userId: string,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  const supabase = createAdminClient();

  await supabase.from("mindboost_conversation").insert({
    user_id: userId,
    role,
    content,
    created_at: new Date().toISOString(),
  });

  // Garder seulement les 20 derniers messages
  const { data } = await supabase
    .from("mindboost_conversation")
    .select("id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (data && data.length > 20) {
    const toDelete = data.slice(20).map((d: { id: string }) => d.id);
    await supabase.from("mindboost_conversation").delete().in("id", toDelete);
  }
}

// --- Parking list ---

export async function saveParkingListItem(userId: string, idea: string): Promise<void> {
  const supabase = createAdminClient();
  const key = `parking_list_${Date.now()}`;
  await supabase.from("mindboost_memory").insert({
    user_id: userId,
    memory_type: key,
    content: JSON.stringify({ idea, saved_at: new Date().toISOString(), status: "pending" }),
    relevance_score: 1,
    expires_at: null,
  });
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
  await supabase.from("mindboost_memory").upsert(
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
  await supabase
    .from("mindboost_memory")
    .delete()
    .eq("user_id", userId)
    .eq("memory_type", "evening_check_pending");
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

  await supabase.from("mindboost_memory").upsert(
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

  return newCount;
}

export async function resetLoopCount(userId: string): Promise<void> {
  const supabase = createAdminClient();
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  await supabase.from("mindboost_memory").upsert(
    {
      user_id: userId,
      memory_type: "loop_flag",
      content: JSON.stringify({ count: 0, last_updated: new Date().toISOString() }),
      relevance_score: 1,
      expires_at: expires,
    },
    { onConflict: "user_id,memory_type" }
  );
}
