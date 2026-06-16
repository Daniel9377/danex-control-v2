import { NextRequest, NextResponse } from "next/server";
import { processMessageWithAI } from "@/lib/mindboost/decision-engine";
import { sendTelegramMessage } from "@/lib/mindboost/telegram";

function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.MINDBOOST_API_SECRET;
  if (!secret) return false;
  return authHeader === `Bearer ${secret}`;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { message, chatId } = await req.json() as { message: string; chatId?: string };

    if (!message) {
      return NextResponse.json({ error: "message requis" }, { status: 400 });
    }

    const response = await processMessageWithAI(message);

    if (chatId) {
      await sendTelegramMessage(chatId, response);
    }

    return NextResponse.json({ ok: true, response });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
