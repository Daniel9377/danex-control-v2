import { createAdminClient } from "@/lib/supabase/admin";

export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
  created_at?: string;
};

const MAX_HISTORY = 5;

export async function getConversationHistory(userId: string): Promise<ConversationMessage[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("mindboost_conversation")
    .select("role, content, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(MAX_HISTORY);

  if (error) {
    console.error("Error fetching conversation history:", error.message);
    return [];
  }

  return ((data ?? []) as ConversationMessage[]).reverse();
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
