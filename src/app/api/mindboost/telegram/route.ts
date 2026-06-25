import { NextRequest, NextResponse, after } from "next/server";
import {
  getTelegramMessage,
  handleTelegramCommand,
  isAllowedTelegramChat,
  sendTelegramMessage,
  sendTelegramDocument,
  downloadTelegramPhoto,
  analyzeImage,
  downloadTelegramVoice,
  transcribeVoice,
  type TelegramUpdate,
} from "@/lib/mindboost/telegram";
import { processMessageWithAI } from "@/lib/mindboost/decision-engine";
import { getMindboostAlerts } from "@/lib/mindboost/alerts";
import { evaluateEscalationLevel, logEscalation, applyEscalationToReply, checkAndUpdateAlertCooldown } from "@/lib/mindboost/escalation";
import { incrementLoopCount, resetLoopCount, getEveningCheckPending, deleteEveningCheckPending } from "@/lib/mindboost/conversation-memory";
import { getActiveIntakeSession, detectIntakeTrigger, startIntakeSession, searchExistingClient } from "@/lib/mindboost/client-intake";
import { getDailySummaries } from "@/lib/mindboost/conversation-memory";
import { getMindboostTodaySummary } from "@/lib/mindboost/today-summary";
import { getUrgentPurchaseAlerts } from "@/lib/mindboost/alerts";
import { saveReport } from "@/lib/mindboost/reports";

export const runtime = "nodejs";

const MINDBOOST_USER_ID = process.env.MINDBOOST_USER_ID ?? "unknown";

// In-process dedup: drop Telegram retries for the same update_id
const recentUpdateIds = new Set<number>();

function requireWebhookSecret() {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret) throw new Error("Missing env var: TELEGRAM_WEBHOOK_SECRET");
  return secret;
}

function isValidTelegramWebhook(request: NextRequest) {
  return request.headers.get("x-telegram-bot-api-secret-token") === requireWebhookSecret();
}

function isSlashCommand(text: string): boolean {
  return text.trim().startsWith("/");
}

async function processText(text: string, chatId: number | string): Promise<void> {
  const userId = MINDBOOST_USER_ID;

  // Slash commands = concrete action → reset loop, skip escalation
  if (isSlashCommand(text)) {
    if (text.trim() === "/pdf") {
      await handlePdfCommand(userId, chatId);
      return;
    }
    const reply = await handleTelegramCommand(text);
    await resetLoopCount(userId);
    await sendTelegramMessage(chatId, reply);
    return;
  }

  // Evening check response — must run BEFORE intake and DeepSeek
  const eveningPending = await getEveningCheckPending(userId);
  if (eveningPending && /^(oui|non|yes|no|pas encore|pas fait)$/i.test(text.trim())) {
    await deleteEveningCheckPending(userId);
    await resetLoopCount(userId);

    if (/^(oui|yes)$/i.test(text.trim())) {
      const nowChina = new Date(Date.now() + 8 * 60 * 60 * 1000);
      const todayDate = nowChina.toISOString().split('T')[0];
      const [summary, urgentPurchases] = await Promise.all([
        getMindboostTodaySummary(),
        getUrgentPurchaseAlerts(userId),
      ]);
      const lines = [
        `Valide. Voici le bilan du jour :`,
        `Transactions : ${summary.transactionCount} (${summary.realExpenseCount} vraies depenses).`,
      ];
      if (urgentPurchases.length > 0) {
        const p = urgentPurchases[0];
        lines.push(`Achat en attente : ${p.client_name} — ${p.product_name}.`);
      } else {
        lines.push(`Aucun achat urgent.`);
      }
      const priorite = urgentPurchases.length > 0
        ? `${urgentPurchases[0].product_name} (${urgentPurchases[0].client_name})`
        : "Rien d urgent";
      lines.push(`Priorite demain : ${priorite}.`);
      const bilanText = lines.join('\n');
      await sendTelegramMessage(chatId, bilanText);
      await saveReport(userId, 'daily', todayDate, bilanText, {
        transaction_count: summary.transactionCount,
        real_expense_count: summary.realExpenseCount,
        urgent_purchases_count: urgentPurchases.length,
      });
    } else {
      await sendTelegramMessage(
        chatId,
        "Pas de probleme. Prends 2 minutes avant de dormir.\nAlimentation, transport, autres — note les dans l app.\nJe verifie demain matin."
      );
    }
    return;
  }

  // Natural language todo shortcut
  const todoShortcut = /qu.?est.?ce que j.?ai.{0,20}faire|mes t[aâ]ches|ma liste|\btodo\b/i;
  if (todoShortcut.test(text)) {
    const reply = await handleTelegramCommand("/todo");
    await resetLoopCount(userId);
    await sendTelegramMessage(chatId, reply);
    return;
  }

  // Intake trigger detection — must run BEFORE any DB/AI call
  const trigger = detectIntakeTrigger(text);
  if (trigger.triggered) {
    const activeIntake = await getActiveIntakeSession(userId);
    if (activeIntake) {
      await sendTelegramMessage(
        chatId,
        `Tu as déjà un intake en cours pour ${activeIntake.client_name}. Veux-tu l'abandonner ? (oui / non)`
      );
      return;
    }
    let existingClientId: string | null = null;
    if (trigger.clientName) {
      const found = await searchExistingClient(userId, trigger.clientName);
      existingClientId = found?.id ?? null;
    }

    // Mention resolve check — deterministic regex, no AI needed
    if (!isSlashCommand(text)) {
      const resolveRe = /(?:c'est bon pour|cest bon pour|réglé pour|regle pour|réglé avec|regle avec|résolu pour|resolu pour)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]*)|([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]*)\s+(?:c'est fait|cest fait|est réglé|est regle|est résolu|est resolu)/i;
      const resolveMatch = text.match(resolveRe);
      if (resolveMatch) {
        const name = (resolveMatch[1] || resolveMatch[2]).trim();
        const supabase = (await import("@/lib/supabase/admin")).createAdminClient();
        const { data: openMentions } = await supabase
          .from("mindboost_mentions")
          .select("id, person_name, description")
          .eq("user_id", userId)
          .eq("status", "open")
          .ilike("person_name", `%${name}%`)
          .order("created_at", { ascending: false })
          .limit(1);

        if (openMentions && openMentions.length > 0) {
          const mention = openMentions[0];
          await supabase.from("mindboost_mentions")
            .update({ status: "resolved", resolved_at: new Date().toISOString() })
            .eq("id", mention.id);
          await sendTelegramMessage(chatId, `Mention pour ${mention.person_name} marquee resolue.`);
        } else {
          await sendTelegramMessage(chatId, `Aucune mention ouverte trouvee pour "${name}".`);
        }
        return;
      }
    }
    const { firstQuestion } = await startIntakeSession(userId, trigger.clientName, existingClientId);
    await resetLoopCount(userId);
    await sendTelegramMessage(chatId, firstQuestion);
    return;
  }

  // Active intake (ongoing response) — bypass escalation + loop entirely
  const activeIntake = await getActiveIntakeSession(userId);
  if (activeIntake) {
    const result = await processMessageWithAI(text);
    await resetLoopCount(userId);
    await sendTelegramMessage(chatId, result.reply);
    return;
  }

  // No active intake: run AI + alerts in parallel
  const [result, alerts] = await Promise.all([
    processMessageWithAI(text),
    getMindboostAlerts(),
  ]);

  const reply = result.reply;
  const signal = result.cooperationSignal;

  // Cooperation signal: DECISION → reset, EVASION → increment, NEUTRE → do nothing
  if (signal === "DECISION") {
    await resetLoopCount(userId);
  } else if (signal === "EVASION") {
    await incrementLoopCount(userId);
  }
  // NEUTRE: leave counter untouched (info requests, small talk, questions)

  const level = await evaluateEscalationLevel(text, alerts, userId);

  // Level 4: loop detected — interrupt normal flow
  if (level === 4) {
    await logEscalation(userId, text, 4, "3_messages_no_action");
    await resetLoopCount(userId);
    await sendTelegramMessage(
      chatId,
      "⚠️ Je tourne en rond. Dis-moi exactement ce que tu veux faire : ajouter une dette, créer un événement, suivre un client, ou autre chose ?"
    );
    return;
  }

  // Level 5: reserved — log only
  if (level === 5) {
    await logEscalation(userId, text, 5, "manual_trigger");
  }

  let finalReply = reply;

  if (level === 1) {
    finalReply = applyEscalationToReply(reply, 1);
  } else if (level === 2) {
    // Cooldown 3h: ne pas spammer l'alerte financière
    const canAlert = await checkAndUpdateAlertCooldown(userId);
    if (canAlert) {
      await logEscalation(userId, text, 2, "financial_alert");
      finalReply = applyEscalationToReply(reply, 2);
    }
  } else if (level === 3) {
    await logEscalation(userId, text, 3, "critical_order");
    finalReply = applyEscalationToReply(reply, 3);
  }

  await sendTelegramMessage(chatId, finalReply);
}

async function processPhoto(fileId: string, chatId: number | string): Promise<void> {
  try {
    const base64 = await downloadTelegramPhoto(fileId);
    const description = await analyzeImage(base64);
    await sendTelegramMessage(chatId, description);
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("[Mindboost] Image processing error:", msg);
    await sendTelegramMessage(
      chatId,
      "Je n'ai pas pu lire cette image. Essaie de me l'envoyer en document."
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "Mindboost Telegram webhook",
    mode: "read-only",
  });
}

export async function POST(request: NextRequest) {
  if (!isValidTelegramWebhook(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const update = (await request.json()) as TelegramUpdate;

  // Deduplication: drop retries for the same update_id
  const updateId = update.update_id;
  if (updateId !== undefined) {
    if (recentUpdateIds.has(updateId)) {
      return NextResponse.json({ ok: true, ignored: "duplicate" });
    }
    recentUpdateIds.add(updateId);
    if (recentUpdateIds.size > 100) {
      const oldest = recentUpdateIds.values().next().value;
      if (oldest !== undefined) recentUpdateIds.delete(oldest);
    }
  }

  const message = getTelegramMessage(update);
  if (!message) {
    return NextResponse.json({ ok: true, ignored: "No message" });
  }

  const chatId = message.chat.id;
  if (!isAllowedTelegramChat(chatId)) {
    return NextResponse.json({ ok: true, ignored: "Unauthorized chat" });
  }

  const { searchParams } = new URL(request.url);
  const dryRun = searchParams.get("dryRun") === "1";

  // Photo message
  if (message.photo && message.photo.length > 0) {
    const fileId = message.photo[message.photo.length - 1].file_id;

    if (dryRun) {
      return NextResponse.json({ ok: true, dryRun: true, reply: `[photo] file_id: ${fileId}` });
    }

    after(async () => {
      await processPhoto(fileId, chatId);
    });

    return NextResponse.json({ ok: true });
  }

  // Voice message
  if (message.voice) {
    const fileId = message.voice.file_id;

    if (dryRun) {
      return NextResponse.json({ ok: true, dryRun: true, reply: `[voice] file_id: ${fileId}` });
    }

    after(async () => {
      try {
        const buffer = await downloadTelegramVoice(fileId);
        const transcribedText = await transcribeVoice(buffer);
        await sendTelegramMessage(chatId, `[Vocal transcrit] : ${transcribedText}`);
        await processText(transcribedText, chatId);
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        console.error("[Mindboost] Voice processing error:", msg);
        await sendTelegramMessage(chatId, "Je n'ai pas pu lire ce vocal. Essaie d'envoyer un message texte.");
      }
    });

    return NextResponse.json({ ok: true });
  }

  // Text message
  const text = message.text ?? "";

  if (dryRun) {
    try {
      let reply: string;
      if (isSlashCommand(text)) {
        reply = await handleTelegramCommand(text);
      } else {
        const result = await processMessageWithAI(text);
        reply = result.reply;
      }
      return NextResponse.json({ ok: true, dryRun: true, reply });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
  }

  // Production: return 200 immediately, process after response
  after(async () => {
    try {
      await processText(text, chatId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Unknown error";
      console.error("[Mindboost] Webhook processing error:", msg);
      try {
        await sendTelegramMessage(chatId, "Erreur interne. Reessaie dans un instant.");
      } catch {}
    }
  });

  return NextResponse.json({ ok: true });
}

// ── /pdf command — generates PDF from daily summaries + full transcript ──

async function handlePdfCommand(userId: string, chatId: number | string): Promise<void> {
  const supabase = (await import("@/lib/supabase/admin")).createAdminClient();

  // Fetch data
  const [summaries, { data: messages }] = await Promise.all([
    getDailySummaries(userId),
    supabase.from("mindboost_conversation").select("role, content, created_at")
      .eq("user_id", userId).order("created_at", { ascending: true }),
  ]);

  const msgCount = messages?.length ?? 0;
  if (msgCount > 5000) {
    console.warn(`[/pdf] Large transcript: ${msgCount} messages — PDF may be heavy`);
  }

  // Generate PDF with jspdf
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  let y = 15;

  // Title
  doc.setFontSize(14);
  doc.text("Mindboost — Archive", 15, y);
  y += 10;

  // Section 1: Daily summaries
  doc.setFontSize(11);
  doc.text("Resumes par jour", 15, y);
  y += 6;
  doc.setFontSize(9);
  if (summaries.length === 0) {
    doc.text("(aucun resume)", 15, y); y += 5;
  } else {
    for (const s of summaries) {
      const lines = doc.splitTextToSize(`[${s.summary_date}] ${s.summary}`, 180);
      for (const line of lines) { doc.text(line, 15, y); y += 4; if (y > 280) { doc.addPage(); y = 15; } }
      y += 2;
    }
  }

  // Section 2: Full transcript
  y += 5;
  doc.addPage();
  y = 15;
  doc.setFontSize(11);
  doc.text("Transcript complet", 15, y);
  y += 6;
  doc.setFontSize(8);
  if (!messages || messages.length === 0) {
    doc.text("(aucun message)", 15, y);
  } else {
    for (const m of messages as any[]) {
      const ts = m.created_at ? new Date(m.created_at).toISOString().slice(11, 19) : "?";
      const line = `[${ts}] ${m.role}: ${m.content}`;
      const wrapped = doc.splitTextToSize(line, 180);
      for (const w of wrapped) { doc.text(w, 15, y); y += 3.5; if (y > 280) { doc.addPage(); y = 15; } }
    }
  }

  // Send
  const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
  await sendTelegramDocument(chatId, pdfBuffer, `mindboost-archive.pdf`, `Archive Mindboost — ${summaries.length} jours, ${msgCount} messages`);
}
