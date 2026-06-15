import { NextRequest, NextResponse } from "next/server";
import {
  getTelegramMessage,
  handleTelegramCommand,
  isAllowedTelegramChat,
  sendTelegramMessage,
  type TelegramUpdate,
} from "@/lib/mindboost/telegram";

export const runtime = "nodejs";

function requireWebhookSecret() {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (!secret) {
    throw new Error("Missing env var: TELEGRAM_WEBHOOK_SECRET");
  }

  return secret;
}

function isValidTelegramWebhook(request: NextRequest) {
  const expectedSecret = requireWebhookSecret();
  const receivedSecret = request.headers.get("x-telegram-bot-api-secret-token");

  return receivedSecret === expectedSecret;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "Mindboost Telegram webhook",
    mode: "read-only",
  });
}

export async function POST(request: NextRequest) {
  try {
    if (!isValidTelegramWebhook(request)) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const update = (await request.json()) as TelegramUpdate;
    const message = getTelegramMessage(update);

    if (!message) {
      return NextResponse.json({ ok: true, ignored: "No message" });
    }

    const chatId = message.chat.id;

    if (!isAllowedTelegramChat(chatId)) {
      return NextResponse.json({ ok: true, ignored: "Unauthorized chat" });
    }

    const text = message.text ?? "";
    const reply = await handleTelegramCommand(text);

    const { searchParams } = new URL(request.url);
    const dryRun = searchParams.get("dryRun") === "1";

    if (!dryRun) {
      await sendTelegramMessage(chatId, reply);
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      reply,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Telegram webhook error";

    return NextResponse.json(
      {
        ok: false,
        error: "Mindboost Telegram webhook failed",
        message,
      },
      { status: 500 }
    );
  }
}
