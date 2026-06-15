import type { AlertsReport } from "@/lib/mindboost/alerts";

export function formatAlertsMessage(report: AlertsReport): string {
  const lines: string[] = [];

  lines.push(`Mindboost - Alertes ${report.date}`);
  lines.push("");

  if (!report.hasUrgentIssues) {
    lines.push("Aucune alerte critique aujourd'hui.");
    lines.push("Continue.");
    return lines.join("\n");
  }

  if (report.debts.length > 0) {
    lines.push("DETTES NON REGLEES :");
    lines.push("");
    for (const d of report.debts) {
      const direction = d.direction === "i_owe" ? "Tu dois" : "On te doit";
      lines.push(`- ${direction} ${d.amount} ${d.currency} a ${d.person_name}`);
      lines.push(`  Depuis ${d.daysOld} jours. Statut : ${d.status}.`);
      if (d.daysOld >= 14) {
        lines.push(`  URGENT - ca fait trop longtemps.`);
      }
    }
    lines.push("");
  }

  if (report.clientMoney.length > 0) {
    lines.push("ARGENT CLIENT EN ATTENTE :");
    lines.push("");
    for (const c of report.clientMoney) {
      lines.push(`- Client ${c.client_id.slice(0, 8)} : ${c.balance} ${c.currency} non utilise`);
      lines.push(`  Recu il y a ${c.daysOld} jours. Commande en cours ?`);
    }
    lines.push("");
  }

  lines.push("Tu dois agir aujourd'hui. Pas demain.");

  return lines.join("\n");
}
