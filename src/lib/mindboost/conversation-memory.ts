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
