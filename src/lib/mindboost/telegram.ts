import {
  getMindboostTodaySummary,
  type MindboostTodaySummary,
} from "@/lib/mindboost/today-summary";
import { getParkingList } from "@/lib/mindboost/conversation-memory";
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
  voice?: { file_id: string; duration?: number };
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

export async function sendTelegramDocument(
  chatId: number | string,
  buffer: Buffer,
  filename: string,
  caption?: string
) {
  const token = requireEnv("TELEGRAM_BOT_TOKEN");
  const formData = new FormData();
  formData.append("chat_id", String(chatId));
  formData.append("document", new Blob([new Uint8Array(buffer)]), filename);
  if (caption) formData.append("caption", caption);

  const response = await fetch(`https://api.telegram.org/bot${token}/sendDocument`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Telegram sendDocument failed: ${response.status} ${errorText}`);
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
    "/todo - liste des taches en attente",
    "/parking - liste des idees en attente",
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

export async function downloadTelegramVoice(fileId: string): Promise<Buffer> {
  const token = requireEnv("TELEGRAM_BOT_TOKEN");

  const fileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
  if (!fileRes.ok) throw new Error(`Telegram getFile failed: ${fileRes.status}`);
  const fileData = await fileRes.json() as { result: { file_path: string } };
  const filePath = fileData.result.file_path;

  const audioRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
  if (!audioRes.ok) throw new Error(`Telegram voice download failed: ${audioRes.status}`);

  const buffer = await audioRes.arrayBuffer();
  return Buffer.from(buffer);
}

export async function transcribeVoice(audioBuffer: Buffer): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");

  const formData = new FormData();
  const uint8 = new Uint8Array(audioBuffer);
  const blob = new Blob([uint8], { type: "audio/ogg" });
  formData.append("file", blob, "voice.ogg");
  formData.append("model", "whisper-1");
  formData.append("language", "fr");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Whisper API error: ${response.status} ${err}`);
  }

  const data = await response.json() as { text: string };
  return data.text ?? "";
}

export async function analyzeImage(base64Image: string): Promise<string> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("Missing env var: DEEPSEEK_API_KEY");

  const response = await fetch("https://api.deepseek.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-chat",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
            { type: "text", text: "Décris cette image dans un contexte import/export Chine-Afrique." },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`DeepSeek API error: ${response.status} ${err}`);
  }

  const data = await response.json() as { choices: Array<{ message: { content: string } }> };
  return data.choices[0]?.message?.content ?? "Impossible d'analyser l'image.";
}

export async function handleTelegramCommand(text: string) {
  const cleanText = text.trim();

  if (!cleanText || cleanText === "/help" || cleanText === "help") {
    return getHelpMessage();
  }

  if (cleanText === "/pdf") {
    return "PDF en cours de génération…"; // Actual PDF sent via separate flow in route.ts
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

  if (cleanText === "/todo") {
    const userId = process.env.MINDBOOST_USER_ID ?? "unknown";
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const supabase = createAdminClient();
    const { data: tasks } = await supabase
      .from("mindboost_tasks")
      .select("id, type, title, status, data")
      .eq("user_id", userId)
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    if (!tasks || tasks.length === 0) {
      return "Aucune tache en attente. Bonne journee.";
    }

    type Task = { id: string; type: string; title: string; status: string; data: Record<string, unknown> };
    const orders = (tasks as Task[]).filter((t) => t.type === "client_order");
    const personal = (tasks as Task[]).filter((t) => t.type === "personal");
    const lines = ["Todo list :", ""];

    if (orders.length > 0) {
      lines.push(`Commandes clients (${orders.length}) :`);
      orders.forEach((t, i) => {
        const clientName = (t.data as { client_name?: string })?.client_name ?? "";
        lines.push(`${i + 1}. Commande ${clientName} — ${t.title} (${t.status})`);
      });
      lines.push("");
    }

    if (personal.length > 0) {
      lines.push(`Taches personnelles (${personal.length}) :`);
      personal.forEach((t, i) => lines.push(`${i + 1}. ${t.title}`));
      lines.push("");
    }

    lines.push(`Total : ${tasks.length} tache(s) en attente.`);
    return lines.join("\n");
  }

  if (cleanText === "/parking") {
    const userId = process.env.MINDBOOST_USER_ID ?? "unknown";
    const items = await getParkingList(userId);
    if (items.length === 0) {
      return "Parking list vide. Aucune idee en attente.";
    }
    const lines = ["Parking list :", ""];
    items.forEach((item, i) => {
      const date = new Date(item.saved_at).toLocaleDateString("fr-FR");
      lines.push(`${i + 1}. ${item.idea} (${date})`);
    });
    return lines.join("\n");
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