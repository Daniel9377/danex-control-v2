import {
  getMindboostTodaySummary,
  type MindboostTodaySummary,
} from "@/lib/mindboost/today-summary";

export type TelegramMessage = {
  message_id: number;
  text?: string;
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

  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }

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
    headers: {
      "Content-Type": "application/json",
    },
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

  if (entries.length === 0) {
    return "Aucune vraie dépense détectée.";
  }

  return entries
    .map(([currency, amount]) => `- ${amount} ${currency}`)
    .join("\n");
}

function formatCategories(summary: MindboostTodaySummary) {
  if (summary.categories.length === 0) {
    return "Aucune catégorie de vraie dépense.";
  }

  return summary.categories
    .map((item) => `- ${item.category}: ${item.amount} ${item.currency}`)
    .join("\n");
}

export function formatTodaySummary(summary: MindboostTodaySummary) {
  return [
    `Mindboost — Résumé du ${summary.date}`,
    "",
    `App complétée: ${summary.appCompleted ? "Oui" : "Non"}`,
    `Transactions: ${summary.transactionCount}`,
    `Vraies dépenses: ${summary.realExpenseCount}`,
    "",
    "Totaux:",
    formatTotals(summary.totalsByCurrency),
    "",
    "Catégories:",
    formatCategories(summary),
    "",
    summary.message,
  ].join("\n");
}

export function getHelpMessage() {
  return [
    "Mindboost commandes:",
    "",
    "/today — résumé du jour",
    "/status — statut du jour",
    "/check YYYY-MM-DD — vérifier une date",
    "/help — aide",
    "",
    "Mode actuel: lecture seule.",
  ].join("\n");
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

  if (cleanText.startsWith("/check")) {
    const parts = cleanText.split(/\s+/);
    const date = parts[1];

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return "Format invalide. Utilise: /check YYYY-MM-DD";
    }

    const summary = await getMindboostTodaySummary(date);
    return formatTodaySummary(summary);
  }

  return getHelpMessage();
}
