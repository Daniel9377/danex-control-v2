import { createAdminClient } from "@/lib/supabase/admin";
import type { AlertsReport } from "@/lib/mindboost/alerts";

const ALERT_COOLDOWN_MS = 3 * 60 * 60 * 1000; // 3 hours

export async function checkAndUpdateAlertCooldown(userId: string): Promise<boolean> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("mindboost_memory")
    .select("updated_at")
    .eq("user_id", userId)
    .eq("memory_type", "alert_cooldown")
    .single();

  const now = Date.now();
  if (data?.updated_at) {
    const lastAlert = new Date(data.updated_at as string).getTime();
    if (now - lastAlert < ALERT_COOLDOWN_MS) return false;
  }

  const { error } = await supabase.from("mindboost_memory").upsert(
    {
      user_id: userId,
      memory_type: "alert_cooldown",
      content: JSON.stringify({ last_alert: new Date().toISOString() }),
      relevance_score: 1,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,memory_type" }
  );
  if (error) {
    console.error("[checkAndUpdateAlertCooldown] upsert error:", error.code, error.message);
    // Non-fatal: returns true (alert can fire) — cooldown doesn't engage,
    // user may get duplicate alerts. Prefer over-suppression (return false).
  }

  return true;
}

const LEVEL1_KEYWORDS = [
  "urgent", "urgente", "urgence", "problème", "probleme", "bloqué", "bloque",
  "impossible", "aide", "crisis", "critique", "perdu", "paniqué", "panique",
];

export async function evaluateEscalationLevel(
  message: string,
  alerts: AlertsReport,
  userId: string
): Promise<number> {
  const lower = message.toLowerCase();

  // Level 4: loop detected
  const loopFlag = await getLoopFlag(userId);
  if (loopFlag >= 3) return 4;

  // Level 3: critical business situation
  const hasLargeUnpaidOrder = alerts.clientMoney.some((c) => c.balance > 500);
  if (hasLargeUnpaidOrder) return 3;

  // Level 2: financial alert — overdue debt or unresponsive client
  const hasOverdueDebt = alerts.debts.some((d) => d.daysOld > 7);
  const hasOldClientMoney = alerts.clientMoney.some((c) => c.daysOld > 5);
  if (hasOverdueDebt || hasOldClientMoney) return 2;

  // Level 1: urgency keyword
  if (LEVEL1_KEYWORDS.some((kw) => lower.includes(kw))) return 1;

  return 0;
}

async function getLoopFlag(userId: string): Promise<number> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("mindboost_memory")
    .select("content")
    .eq("user_id", userId)
    .eq("memory_type", "loop_flag")
    .single();

  if (!data?.content) return 0;
  try {
    const parsed = JSON.parse(data.content as string);
    return parsed.count ?? 0;
  } catch {
    return 0;
  }
}

export async function logEscalation(
  userId: string,
  triggerMessage: string,
  level: number,
  reason: string
): Promise<void> {
  if (level < 2) return;
  const supabase = createAdminClient();
  const { error } = await supabase.from("mindboost_escalations").insert({
    user_id: userId,
    trigger_message: triggerMessage,
    level,
    reason,
    resolved: false,
  });
  if (error) {
    console.error("[logEscalation] insert error:", error.code, error.message);
    // Non-fatal: audit trail only, user experience identical
  }
}

export function applyEscalationToReply(reply: string, level: number): string {
  if (level === 1) return `⚠️ ${reply}`;
  if (level === 2) return `${reply}\n\n⚠️ Alerte financière détectée. Vérifie tes dettes ou clients en attente.`;
  if (level === 3) return `${reply}\n\n🔴 Situation critique : commande importante sans avance reçue.`;
  return reply;
}
