export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getChinaDateISO } from "@/lib/mindboost/time";
import { getConversationHistory, upsertDailySummary, saveEveningCheckPending, formatMentionLine, formatReconciliationLine } from "@/lib/mindboost/conversation-memory";
import { getMindboostTodaySummary } from "@/lib/mindboost/today-summary";
import { formatEveningReport } from "@/lib/mindboost/evening-report";
import { getUrgentPurchaseAlerts } from "@/lib/mindboost/alerts";
import { sendTelegramMessage } from "@/lib/mindboost/telegram";
import { callDeepSeek } from "@/lib/mindboost/deepseek";

export async function GET() {
  const userId = process.env.MINDBOOST_USER_ID;
  if (!userId) return NextResponse.json({ error: "Missing MINDBOOST_USER_ID" }, { status: 500 });

  const todayChina = getChinaDateISO();
  const supabase = createAdminClient();

  try {
    // 1. Today's raw messages
    const { data: todayMessages } = await supabase
      .from("mindboost_conversation")
      .select("role, content, created_at")
      .eq("user_id", userId)
      .gte("created_at", `${todayChina}T00:00:00+08:00`)
      .order("created_at", { ascending: true });

    // 2. Today's financial report
    const todaySummary = await getMindboostTodaySummary(todayChina);
    const reportText = formatEveningReport(todaySummary);

    // 3. Previous daily summaries for continuity
    const { data: prevSummaries } = await supabase
      .from("mindboost_daily_summary")
      .select("summary_date, summary")
      .eq("user_id", userId)
      .order("summary_date", { ascending: true });

    const priorContext = prevSummaries?.length
      ? prevSummaries.map((s: any) => `[${s.summary_date}] ${s.summary}`).join("\n")
      : "(aucun résumé précédent)";

    // 4. Produce a real summary via DeepSeek
    const transcript = (todayMessages ?? [])
      .map((m: any) => `${m.role}: ${m.content}`)
      .join("\n");

    const summaryPrompt = `Produis un résumé concis de la journée de Daniel (date: ${todayChina}).
Structure: 1) Sujets abordés, 2) Décisions prises, 3) Points en suspens, 4) Tâches à suivre demain.

Contexte financier du jour:
${reportText}

Conversation du jour:
${transcript || "(aucun message aujourd'hui)"}

Résumés des jours précédents (pour continuité):
${priorContext}

Règles: pas de chiffres inventés — utilise uniquement les données fournies. Max 8 lignes. Français.
Ne mets PAS de formules de politesse, pas de "Résumé du jour:", pas de "Bonjour".`;

    const summaryText = await callDeepSeek([
      { role: "system", content: "Tu es un assistant qui résume des journées de travail. Sois concis et factuel." },
      { role: "user", content: summaryPrompt },
    ], 300);

    // 5. Upsert into daily summaries
    await upsertDailySummary(userId, todayChina, summaryText);

    // 5b. Fetch open mentions
    const { data: openMentions } = await supabase
      .from("mindboost_mentions")
      .select("person_name, description, created_at")
      .eq("user_id", userId)
      .eq("status", "open")
      .order("created_at", { ascending: true });

    const mentionLines = openMentions?.length
      ? openMentions.map((m: any) => formatMentionLine(m)).join("\n")
      : "Aucune mention en attente.";

    // Process pending reconciliations — escalate or close based on app state
    const { data: pendingRcs } = await supabase
      .from("mindboost_reconciliations")
      .select("*")
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    const rcLines: string[] = [];
    if (pendingRcs) {
      for (const rc of pendingRcs as any[]) {
        if (rc.entity_type !== "new_entity" && rc.entity_id && rc.snapshot) {
          // Compare current Supabase state against snapshot
          const table = rc.entity_type === "debt" ? "debts" : "orders";
          const { data: current } = await supabase.from(table).select("*").eq("id", rc.entity_id).maybeSingle();
          if (current) {
            const snap = rc.snapshot as Record<string, unknown>;
            const changed = Object.keys(snap).some((k) => String(current[k]) !== String(snap[k]));
            if (changed) {
              await supabase.from("mindboost_reconciliations")
                .update({ status: "app_updated", resolved_at: new Date().toISOString() })
                .eq("id", rc.id);
              continue; // Skip — resolved
            }
          }
        }

        // Not changed or new_entity — escalate
        const newDay = (rc.escalation_day ?? 0) + 1;
        if (newDay >= 5) {
          // Default to app truth after 5 days
          await supabase.from("mindboost_reconciliations")
            .update({ status: "defaulted_to_app", escalation_day: newDay, resolved_at: new Date().toISOString() })
            .eq("id", rc.id);
          // Don't show this one anymore in context going forward
        } else {
          await supabase.from("mindboost_reconciliations")
            .update({ escalation_day: newDay, last_reminded_at: new Date().toISOString() })
            .eq("id", rc.id);
          rcLines.push(formatReconciliationLine({ ...rc, escalation_day: newDay }));
        }
      }
    }

    // 6. Send evening report to Telegram + trigger evening check flow
    const urgentAlerts = await getUrgentPurchaseAlerts(userId);
    const urgentNote = urgentAlerts.length > 0
      ? `\n⚠️ ${urgentAlerts.length} achat(s) urgent(s) en attente.`
      : "";

    await sendTelegramMessage(
      process.env.TELEGRAM_ALLOWED_CHAT_ID!,
      `🌙 Soir — ${todayChina}\n\n${reportText}${urgentNote}\n\nReconciliations:\n${rcLines.length > 0 ? rcLines.join("\n") : "Aucune en attente."}\n\nMentions en attente:\n${mentionLines}\n\nApp completée ? (oui / non)`
    );

    // Save evening check pending so the oui/non flow engages
    await saveEveningCheckPending(userId);

    return NextResponse.json({ ok: true, date: todayChina, messageCount: todayMessages?.length ?? 0 });
  } catch (err: any) {
    console.error("[evening-cron]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
