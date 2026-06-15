import { NextRequest, NextResponse } from "next/server";
import { getMindboostAlerts } from "@/lib/mindboost/alerts";
import { formatAlertsMessage } from "@/lib/mindboost/alerts-format";
import { sendTelegramMessage } from "@/lib/mindboost/telegram";

function isAuthorized(req: NextRequest): boolean {
  const authHeader = req.headers.get("authorization");
  const cronSecret = req.headers.get("x-cron-secret");
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return authHeader === `Bearer ${secret}` || cronSecret === secret;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const report = await getMindboostAlerts();
    const message = formatAlertsMessage(report);

    const chatId = process.env.TELEGRAM_ALLOWED_CHAT_ID;
    if (!chatId) {
      return NextResponse.json({ error: "TELEGRAM_ALLOWED_CHAT_ID manquant" }, { status: 500 });
    }

    await sendTelegramMessage(chatId, message);

    return NextResponse.json({
      ok: true,
      hasUrgentIssues: report.hasUrgentIssues,
      debtAlerts: report.debts.length,
      clientAlerts: report.clientMoney.length,
      sent: true,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
