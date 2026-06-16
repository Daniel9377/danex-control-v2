import { NextRequest, NextResponse, after } from "next/server";
import {
  getTelegramMessage,
  handleTelegramCommand,
  isAllowedTelegramChat,
  sendTelegramMessage,
  downloadTelegramPhoto,
  analyzeImageWithClaude,
  type TelegramUpdate,
} from "@/lib/mindboost/telegram";
import { processMessageWithAI } from "@/lib/mindboost/decision-engine";
import { getMindboostAlerts } from "@/lib/mindboost/alerts";
import { evaluateEscalationLevel, logEscalation, applyEscalationToReply } from "@/lib/mindboost/escalation";
import { incrementLoopCount, resetLoopCount } from "@/lib/mindboost/conversation-memory";

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

  if (isSlashCommand(text)) {
    const reply = await handleTelegramCommand(text);
    await resetLoopCount(userId);
    await sendTelegramMessage(chatId, reply);
    return;
  }

  // Run AI + alerts in parallel
  const [reply, alerts] = await Promise.all([
    processMessageWithAI(text),
    getMindboostAlerts(),
  ]);

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

  // Level >= 2: log escalation
  if (level >= 2) {
    const reason = level === 3 ? "critical_order" : "financial_alert";
    await logEscalation(userId, text, level, reason);
  }

  const finalReply = applyEscalationToReply(reply, level);

  // Track loop counter: AI text reply with no concrete action = increment
  await incrementLoopCount(userId);

  await sendTelegramMessage(chatId, finalReply);
}

async function processPhoto(fileId: string, chatId: number | string): Promise<void> {
  try {
    const base64 = await downloadTelegramPhoto(fileId);
    const description = await analyzeImageWithClaude(base64);
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

  // Text message
  const text = message.text ?? "";

  if (dryRun) {
    try {
      let reply: string;
      if (isSlashCommand(text)) {
        reply = await handleTelegramCommand(text);
      } else {
        reply = await processMessageWithAI(text);
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
