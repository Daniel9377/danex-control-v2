import { createAdminClient } from "@/lib/supabase/admin";
import type { Debt } from "@/lib/supabase/types";
import { getMindboostTodaySummary } from "@/lib/mindboost/today-summary";

export type WeeklyReport = {
  weekStart: string;
  weekEnd: string;
  daysCompleted: number;
  totalDays: number;
  totalsByCurrency: Record<string, number>;
  debtCount: number;
  debtTotalRaw: number;
  clientMoneyPending: number;
  verdict: "propre" | "risque" | "negligee";
  message: string;
};

function getWeekRange(): { start: string; end: string } {
  const now = new Date();
  const chinaOffset = 8 * 60;
  const chinaTime = new Date(now.getTime() + chinaOffset * 60 * 1000);
  const dayOfWeek = chinaTime.getUTCDay();
  const monday = new Date(chinaTime);
  monday.setUTCDate(chinaTime.getUTCDate() - ((dayOfWeek + 6) % 7));
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  };
}

function getDatesInRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = new Date(start);
  const endDate = new Date(end);
  while (current <= endDate) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

export async function getMindboostWeeklyReport(): Promise<WeeklyReport> {
  const userId = process.env.MINDBOOST_USER_ID;
  if (!userId) throw new Error("Missing env var: MINDBOOST_USER_ID");

  const supabase = createAdminClient();
  const { start, end } = getWeekRange();
  const dates = getDatesInRange(start, end);

  let daysCompleted = 0;
  const totalsByCurrency: Record<string, number> = {};

  for (const date of dates) {
    const summary = await getMindboostTodaySummary(date);
    if (summary.appCompleted) daysCompleted++;
    for (const [currency, amount] of Object.entries(summary.totalsByCurrency)) {
      totalsByCurrency[currency] = (totalsByCurrency[currency] ?? 0) + amount;
    }
  }

  const { data: debtsData } = await supabase
    .from("debts")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["unpaid", "partial"]);

  const debts = (debtsData ?? []) as Debt[];
  const debtCount = debts.length;
  const debtTotalRaw = debts.reduce((sum, d) => sum + (d.amount - d.paid_amount), 0);

  const { data: clientTxData } = await supabase
    .from("transactions")
    .select("id")
    .eq("user_id", userId)
    .eq("sub_type", "client_money_received")
    .gte("transaction_date", start)
    .lte("transaction_date", end);

  const clientMoneyPending = (clientTxData ?? []).length;

  const completionRate = daysCompleted / dates.length;
  let verdict: WeeklyReport["verdict"];

  if (completionRate >= 0.85 && debtCount === 0) {
    verdict = "propre";
  } else if (completionRate >= 0.5) {
    verdict = "risque";
  } else {
    verdict = "negligee";
  }

  const verdictMessages = {
    propre: "Semaine propre. C'est ce qu'on veut chaque semaine.",
    risque: "Semaine a risque. Tu peux faire mieux. Corrige la semaine prochaine.",
    negligee: "Semaine negligee. C'est inacceptable. Reprends le controle maintenant.",
  };

  return {
    weekStart: start,
    weekEnd: end,
    daysCompleted,
    totalDays: dates.length,
    totalsByCurrency,
    debtCount,
    debtTotalRaw,
    clientMoneyPending,
    verdict,
    message: verdictMessages[verdict],
  };
}

export function formatWeeklyReport(report: WeeklyReport): string {
  const lines: string[] = [];

  lines.push(`Mindboost - Rapport hebdomadaire`);
  lines.push(`Semaine du ${report.weekStart} au ${report.weekEnd}`);
  lines.push("");
  lines.push(`Jours completes : ${report.daysCompleted}/${report.totalDays}`);
  lines.push("");

  if (Object.keys(report.totalsByCurrency).length > 0) {
    lines.push("Depenses de la semaine :");
    for (const [currency, amount] of Object.entries(report.totalsByCurrency)) {
      lines.push(`- ${amount} ${currency}`);
    }
    lines.push("");
  }

  lines.push(`Dettes actives : ${report.debtCount}`);
  if (report.debtCount > 0) {
    lines.push(`Total restant : ${Math.round(report.debtTotalRaw)} (devise locale)`);
  }
  lines.push("");
  lines.push(`Argent client recu cette semaine : ${report.clientMoneyPending} transaction(s)`);
  lines.push("");
  lines.push(`VERDICT : ${report.verdict.toUpperCase()}`);
  lines.push(report.message);

  return lines.join("\n");
}
