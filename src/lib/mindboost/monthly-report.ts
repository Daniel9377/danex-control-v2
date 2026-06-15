import { createAdminClient } from "@/lib/supabase/admin";
import type { Debt } from "@/lib/supabase/types";
import { getMindboostTodaySummary } from "@/lib/mindboost/today-summary";

export type MonthlyReport = {
  month: string;
  year: string;
  daysCompleted: number;
  totalDays: number;
  completionRate: number;
  totalsByCurrency: Record<string, number>;
  prevTotalsByCurrency: Record<string, number>;
  debtCount: number;
  debtTotalRaw: number;
  activeClients: number;
  score: number;
  verdict: "excellent" | "correct" | "mauvais" | "catastrophique";
  message: string;
};

function getMonthRange(offset: number = 0): { start: string; end: string; month: string; year: string } {
  const now = new Date();
  const chinaOffset = 8 * 60;
  const chinaTime = new Date(now.getTime() + chinaOffset * 60 * 1000);

  chinaTime.setUTCMonth(chinaTime.getUTCMonth() + offset);
  const year = chinaTime.getUTCFullYear();
  const month = chinaTime.getUTCMonth();

  const start = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);

  return {
    start,
    end,
    month: String(month + 1).padStart(2, "0"),
    year: String(year),
  };
}

function getDatesInRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const current = new Date(start);
  const endDate = new Date(end);
  const today = new Date().toISOString().slice(0, 10);
  while (current <= endDate && current.toISOString().slice(0, 10) <= today) {
    dates.push(current.toISOString().slice(0, 10));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function calculateScore(completionRate: number, debtCount: number): number {
  let score = Math.round(completionRate * 70);
  score -= debtCount * 5;
  return Math.max(0, Math.min(100, score));
}

export async function getMindboostMonthlyReport(offset: number = 0): Promise<MonthlyReport> {
  const userId = process.env.MINDBOOST_USER_ID;
  if (!userId) throw new Error("Missing env var: MINDBOOST_USER_ID");

  const supabase = createAdminClient();
  const { start, end, month, year } = getMonthRange(offset);
  const prevRange = getMonthRange(offset - 1);
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

  // Mois precedent
  const prevDates = getDatesInRange(prevRange.start, prevRange.end);
  const prevTotalsByCurrency: Record<string, number> = {};
  for (const date of prevDates) {
    const summary = await getMindboostTodaySummary(date);
    for (const [currency, amount] of Object.entries(summary.totalsByCurrency)) {
      prevTotalsByCurrency[currency] = (prevTotalsByCurrency[currency] ?? 0) + amount;
    }
  }

  // Dettes
  const { data: debtsData } = await supabase
    .from("debts")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["unpaid", "partial"]);

  const debts = (debtsData ?? []) as Debt[];
  const debtCount = debts.length;
  const debtTotalRaw = debts.reduce((sum, d) => sum + (d.amount - d.paid_amount), 0);

  // Clients actifs
  const { data: clientData } = await supabase
    .from("transactions")
    .select("client_id")
    .eq("user_id", userId)
    .gte("transaction_date", start)
    .lte("transaction_date", end)
    .not("client_id", "is", null);

  const uniqueClients = new Set((clientData ?? []).map((t: { client_id: string }) => t.client_id));
  const activeClients = uniqueClients.size;

  const completionRate = dates.length > 0 ? daysCompleted / dates.length : 0;
  const score = calculateScore(completionRate, debtCount);

  let verdict: MonthlyReport["verdict"];
  if (score >= 80) verdict = "excellent";
  else if (score >= 60) verdict = "correct";
  else if (score >= 40) verdict = "mauvais";
  else verdict = "catastrophique";

  const verdictMessages = {
    excellent: "Mois excellent. Tu geres bien. Continue exactement comme ca.",
    correct: "Mois correct. Il y a des failles. Identifie-les et corrige.",
    mauvais: "Mois mauvais. Tu as laisse passer trop de choses. Reprends le controle.",
    catastrophique: "Mois catastrophique. C'est inacceptable. Tu sais ce que tu dois faire.",
  };

  return {
    month,
    year,
    daysCompleted,
    totalDays: dates.length,
    completionRate,
    totalsByCurrency,
    prevTotalsByCurrency,
    debtCount,
    debtTotalRaw,
    activeClients,
    score,
    verdict,
    message: verdictMessages[verdict],
  };
}

export function formatMonthlyReport(report: MonthlyReport): string {
  const lines: string[] = [];

  lines.push(`Mindboost - Rapport mensuel ${report.month}/${report.year}`);
  lines.push("");
  lines.push(`Score de discipline : ${report.score}/100`);
  lines.push(`Jours completes : ${report.daysCompleted}/${report.totalDays} (${Math.round(report.completionRate * 100)}%)`);
  lines.push("");

  if (Object.keys(report.totalsByCurrency).length > 0) {
    lines.push("Depenses ce mois :");
    for (const [currency, amount] of Object.entries(report.totalsByCurrency)) {
      const prev = report.prevTotalsByCurrency[currency] ?? 0;
      const diff = amount - prev;
      const arrow = diff > 0 ? "+" : "";
      lines.push(`- ${Math.round(amount)} ${currency} (${arrow}${Math.round(diff)} vs mois precedent)`);
    }
    lines.push("");
  }

  lines.push(`Dettes actives : ${report.debtCount}`);
  if (report.debtCount > 0) {
    lines.push(`Total restant : ${Math.round(report.debtTotalRaw)} (devise locale)`);
  }
  lines.push("");
  lines.push(`Clients actifs ce mois : ${report.activeClients}`);
  lines.push("");
  lines.push(`VERDICT : ${report.verdict.toUpperCase()}`);
  lines.push(report.message);

  return lines.join("\n");
}
