export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getChinaDateISO } from "@/lib/mindboost/time";
import { getMindboostAlerts, getUrgentPurchaseAlerts } from "@/lib/mindboost/alerts";
import { sendTelegramMessage } from "@/lib/mindboost/telegram";

export async function GET() {
  const userId = process.env.MINDBOOST_USER_ID;
  if (!userId) return NextResponse.json({ error: "Missing MINDBOOST_USER_ID" }, { status: 500 });

  try {
    const today = getChinaDateISO();
    const alerts = await getMindboostAlerts();
    const urgentPurchases = await getUrgentPurchaseAlerts(userId);

    const debtCount = alerts.debts.length;
    const overdueCount = alerts.debts.filter((d: any) => d.daysUntilDue !== null && d.daysUntilDue < 0).length;

    const lines = [
      `☀️ Matin — ${today}`,
      ``,
      `${debtCount} dette(s) active(s)${overdueCount > 0 ? `, dont ${overdueCount} en retard` : ""}.`,
      urgentPurchases.length > 0
        ? `${urgentPurchases.length} achat(s) urgent(s) en attente.`
        : "Aucun achat urgent en attente.",
      ``,
      "Bonne journée.",
    ];

    await sendTelegramMessage(process.env.TELEGRAM_ALLOWED_CHAT_ID!, lines.join("\n"));

    return NextResponse.json({ ok: true, date: today, debtCount, overdueCount, urgentPurchases: urgentPurchases.length });
  } catch (err: any) {
    console.error("[morning-cron]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
