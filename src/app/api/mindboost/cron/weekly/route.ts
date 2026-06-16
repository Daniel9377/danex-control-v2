import { NextRequest, NextResponse } from "next/server";
import { getMindboostWeeklyReport, formatWeeklyReport } from "@/lib/mindboost/weekly-report";
import { sendTelegramMessage } from "@/lib/mindboost/telegram";
import { saveReport } from "@/lib/mindboost/reports";

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
    const report = await getMindboostWeeklyReport();
    const message = formatWeeklyReport(report);

    const chatId = process.env.TELEGRAM_ALLOWED_CHAT_ID;
    if (!chatId) {
      return NextResponse.json({ error: "TELEGRAM_ALLOWED_CHAT_ID manquant" }, { status: 500 });
    }

    await sendTelegramMessage(chatId, message);

    const userId = process.env.MINDBOOST_USER_ID;
    if (userId) {
      const weekDate = new Date().toISOString().split('T')[0];
      await saveReport(userId, 'weekly', weekDate, message).catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      verdict: report.verdict,
      daysCompleted: report.daysCompleted,
      totalDays: report.totalDays,
      sent: true,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
