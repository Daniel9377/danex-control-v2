import type { MindboostTodaySummary } from "@/lib/mindboost/today-summary";

function formatTotals(totalsByCurrency: Record<string, number>) {
  const entries = Object.entries(totalsByCurrency);

  if (entries.length === 0) {
    return "Aucune vraie dépense détectée.";
  }

  return entries.map(([currency, amount]) => `- ${amount} ${currency}`).join("\n");
}

function formatCategories(summary: MindboostTodaySummary) {
  if (summary.categories.length === 0) {
    return "Aucune catégorie de vraie dépense.";
  }

  return summary.categories
    .map((item) => `- ${item.category}: ${item.amount} ${item.currency}`)
    .join("\n");
}

export function formatEveningReport(summary: MindboostTodaySummary) {
  if (!summary.appCompleted) {
    return [
      `Mindboost — Rapport du soir ${summary.date}`,
      "",
      "Daniel, l'app n'est pas complétée aujourd'hui.",
      "",
      "Action maintenant :",
      "1. Ouvre DANEX Control.",
      "2. Ajoute les dépenses du jour par catégorie.",
      "3. Vérifie argent personnel, client et dettes.",
      "",
      "Pas besoin d'être parfait. Mais il faut une trace.",
      "",
      "Statut : non complété.",
    ].join("\n");
  }

  if (summary.realExpenseCount === 0) {
    return [
      `Mindboost — Rapport du soir ${summary.date}`,
      "",
      "App complétée, mais aucune vraie dépense détectée.",
      "",
      `Transactions trouvées : ${summary.transactionCount}`,
      "",
      "Vérification :",
      "- Si c'était client, dette, transfert ou revenu : OK.",
      "- Si tu as dépensé pour toi ou le business : classe correctement dans l'app.",
      "",
      "Statut : complété, mais à vérifier.",
    ].join("\n");
  }

  return [
    `Mindboost — Rapport du soir ${summary.date}`,
    "",
    "App complétée.",
    `Transactions : ${summary.transactionCount}`,
    `Vraies dépenses : ${summary.realExpenseCount}`,
    "",
    "Totaux :",
    formatTotals(summary.totalsByCurrency),
    "",
    "Catégories :",
    formatCategories(summary),
    "",
    "Statut : propre. Continue comme ça.",
  ].join("\n");
}
