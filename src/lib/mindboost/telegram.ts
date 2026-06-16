import {
  getMindboostTodaySummary,
  type MindboostTodaySummary,
} from "@/lib/mindboost/today-summary";
import { formatEveningReport } from "@/lib/mindboost/evening-report";
import { getMindboostWeeklyReport, formatWeeklyReport } from "@/lib/mindboost/weekly-report";
import { getMindboostMonthlyReport, formatMonthlyReport } from "@/lib/mindboost/monthly-report";
import { getUpcomingEvents } from "@/lib/mindboost/google-calendar";

export type TelegramPhotoSize = {
  file_id: string;
  file_size?: number;
  width: number;
  height: number;
};

export type TelegramMessage = {
  message_id: number;
  text?: string;
  photo?: TelegramPhotoSize[];
  chat: {
    id: number | string;
    type?: string;
  };
};

export type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
};

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

export function getTelegramMessage(update: TelegramUpdate) {
  return update.message ?? update.edited_message ?? null;
}

export function isAllowedTelegramChat(chatId: number | string) {
  const allowedChatId = requireEnv("TELEGRAM_ALLOWED_CHAT_ID");
  return String(chatId) === allowedChatId;
}

export async function sendTelegramMessage(chatId: number | string, text: string) {
  const token = requireEnv("TELEGRAM_BOT_TOKEN");

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telegram sendMessage failed: ${response.status} ${errorText}`);
  }
}

function formatTotals(totalsByCurrency: Record<string, number>) {
  const entries = Object.entries(totalsByCurrency);
  if (entries.length === 0) return "Aucune vraie depense detectee.";
  return entries.map(([currency, amount]) => `- ${amount} ${currency}`).join("\n");
}

function formatCategories(summary: MindboostTodaySummary) {
  if (summary.categories.length === 0) return "Aucune categorie de vraie depense.";
  return summary.categories
    .map((item) => `- ${item.category}: ${item.amount} ${item.currency}`)
    .join("\n");
}

export function formatTodaySummary(summary: MindboostTodaySummary) {
  return [
    `Mindboost - Resume du ${summary.date}`,
    "",
    `App completee: ${summary.appCompleted ? "Oui" : "Non"}`,
    `Transactions: ${summary.transactionCount}`,
    `Vraies depenses: ${summary.realExpenseCount}`,
    "",
    "Totaux:",
    formatTotals(summary.totalsByCurrency),
    "",
    "Categories:",
    formatCategories(summary),
    "",
    summary.message,
  ].join("\n");
}

export function getHelpMessage() {
  return [
    "Mindboost commandes:",
    "",
    "/today - resume du jour",
    "/status - statut du jour",
    "/evening - rapport du soir strict",
    "/soir - rapport du soir strict",
    "/check YYYY-MM-DD - verifier une date",
    "/week - rapport hebdomadaire",
    "/month - rapport mensuel",
    "/agenda - evenements 3 prochains jours",
    "/help - aide",
    "",
    "Mode actuel: lecture seule.",
  ].join("\n");
}

export async function downloadTelegramPhoto(fileId: string): Promise<string> {
  const token = requireEnv("TELEGRAM_BOT_TOKEN");

  const fileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
  if (!fileRes.ok) throw new Error(`Telegram getFile failed: ${fileRes.status}`);
  const fileData = await fileRes.json() as { result: { file_path: string } };
  const filePath = fileData.result.file_path;

  const imgRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  if (!imgRes.ok) throw new Error(`Telegram file download failed: ${imgRes.status}`);

  const buffer = await imgRes.arrayBuffer();
  return Buffer.from(buffer).toString("base64");
}

export async function analyzeImageWithClaude(base64Image: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing env var: ANTHROPIC_API_KEY");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: "image/jpeg", data: base64Image },
            },
            {
              type: "text",
              text: "Décris ce que tu vois sur cette image dans le contexte d'une activité commerciale import/export entre la Chine et l'Afrique. Sois précis et factuel. Texte brut, pas de markdown.",
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Claude API error: ${response.status} ${err}`);
  }

  const data = await response.json() as { content: Array<{ text: string }> };
  return data.content[0]?.text ?? "Impossible d'analyser l'image.";
}

export async function handleTelegramCommand(text: string) {
  const cleanText = text.trim();

  if (!cleanText || cleanText === "/help" || cleanText === "help") {
    return getHelpMessage();
  }

  if (cleanText === "/today" || cleanText === "/status") {
    const summary = await getMindboostTodaySummary();
    return formatTodaySummary(summary);
  }

  if (cleanText === "/evening" || cleanText === "/soir" || cleanText === "/rapport") {
    const summary = await getMindboostTodaySummary();
    return formatEveningReport(summary);
  }

  if (cleanText.startsWith("/check")) {
    const parts = cleanText.split(/\s+/);
    const date = parts[1];
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return "Format invalide. Utilise: /check YYYY-MM-DD";
    }
    const summary = await getMindboostTodaySummary(date);
    return formatTodaySummary(summary);
  }

  if (cleanText === "/week") {
    const report = await getMindboostWeeklyReport();
    return formatWeeklyReport(report);
  }

  if (cleanText === "/month") {
    const report = await getMindboostMonthlyReport();
    return formatMonthlyReport(report);
  }

  if (cleanText === "/agenda") {
    const events = await getUpcomingEvents(3);
    if (events.length === 0) {
      return "Aucun evenement dans les 3 prochains jours.";
    }
    const lines = ["Agenda - 3 prochains jours", ""];
    for (const event of events) {
      const start = event.start?.dateTime ?? event.start?.date ?? "?";
      const title = event.summary ?? "Sans titre";
      lines.push(`- ${start.slice(0, 16).replace("T", " ")} : ${title}`);
    }
    return lines.join("\n");
  }

  return getHelpMessage();
}