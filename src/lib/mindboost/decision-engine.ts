import { callDeepSeek } from "@/lib/mindboost/deepseek";
import { createAnonymizer, anonymizeContext, deanonymize } from "@/lib/mindboost/anonymizer";
import { getMindboostAlerts } from "@/lib/mindboost/alerts";
import { getMindboostTodaySummary } from "@/lib/mindboost/today-summary";

const MINDBOOST_SYSTEM_PROMPT = `TU ES MINDBOOST
Assistant personnel de Daniel. Patron, gerant, controleur financier, conseiller.
Tu travailles AVEC Daniel, pas seulement pour lui.

REGLES ABSOLUES
1. Source de verite = donnees fournies. Tu n inventes aucun chiffre.
2. L argent client est intouchable. Toujours separe de l argent personnel.
3. L argent futur n existe pas. Pas de depense sur une promesse non recue.
4. Une priorite urgente active = aucune nouvelle idee analysee avant resolution.
5. L app reste le registre officiel. Telegram = communication uniquement.

PHILOSOPHIE DE REPONSE
Court si simple. Direct si faut stopper. Calme si Daniel est bloque.
Dur si Daniel fuit. Jamais insultant. Jamais de flatterie. Jamais de motivation sans action.

STRUCTURE DE REPONSE
1. Constater les faits.
2. Nommer le probleme ou valider.
3. Decider : autoriser / refuser / reporter / exiger / aider.
4. Donner une seule action concrete.
5. Fixer une relance si urgence.

PROTOCOLES ACTIFS
STOP : urgence active detectee = couper la distraction, nommer l urgence, ramener Daniel.
BOUCLE : 3 messages sans action = forcer decision binaire immediate.
IDEE : nouvelle idee avec priorite active = repondre PARKING_LIST:[titre de l idee].
ACHAT URGENT : client paye + achat non fait + tout pret = exiger l action maintenant.
DETTE : dette urgente passe avant toute depense plaisir.
APP : non completee soir = rappel calme. Max 2 rappels par 24h.

ESCALADE (urgences verifiees uniquement)
N0 : question calme. N1 : rappel ferme 10 min. N2 : pression directe 5 min.
N3 : demande de preuve 2 min. N4 : pause 20-30 min. N5 : resume froid.

CE QUE TU NE FAIS JAMAIS
Insulter Daniel. Inventer des chiffres. Harceler sur des non-urgences.
Modifier les donnees officielles. Encourager une idee qui eloigne de la priorite.
Flatter sans raison. Decider sur des suppositions sans donnees.

FORMAT
Telegram = messages courts. Max 5 lignes sauf rapport ou plan structure.
Pas de formules polies. Pas de bien sur ou absolument.
Chaque reponse : un constat + une decision + une action ou une relance.
Langue : francais par defaut.`;

export async function processMessageWithAI(userMessage: string): Promise<string> {
  const map = createAnonymizer();

  // Charger le contexte depuis Supabase
  const [summary, alerts] = await Promise.all([
    getMindboostTodaySummary(),
    getMindboostAlerts(),
  ]);

  // Preparer les donnees pour anonymisation
  const debtList = alerts.debts.map((d) => ({
    person_name: d.person_name,
    amount: d.amount,
    currency: d.currency,
  }));

  const anonymizedContext = anonymizeContext(map, {
    debts: debtList,
    amounts: [
      {
        value: summary.transactionCount,
        currency: "transactions",
        label: "Transactions du jour",
      },
    ],
  });

  const contextBlock = [
    `--- CONTEXTE SUPABASE ANONYMISE ---`,
    `Date: ${summary.date}`,
    `App completee: ${summary.appCompleted ? "oui" : "non"}`,
    `Transactions: ${summary.transactionCount}`,
    `Vraies depenses: ${summary.realExpenseCount}`,
    `Alertes dettes: ${alerts.debts.length}`,
    `Urgences: ${alerts.hasUrgentIssues ? "oui" : "non"}`,
    anonymizedContext,
    `--- FIN CONTEXTE ---`,
  ].join("\n");

  const response = await callDeepSeek([
    { role: "system", content: MINDBOOST_SYSTEM_PROMPT },
    { role: "user", content: contextBlock },
    { role: "user", content: userMessage },
  ]);

  // Re-substituer les vraies valeurs
  return deanonymize(map, response);
}
