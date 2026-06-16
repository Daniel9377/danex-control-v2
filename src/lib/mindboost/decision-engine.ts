import { callDeepSeek, type DeepSeekMessage } from "@/lib/mindboost/deepseek";
import { createAnonymizer, anonymizeContext, deanonymize } from "@/lib/mindboost/anonymizer";
import { getMindboostAlerts } from "@/lib/mindboost/alerts";
import { getMindboostTodaySummary } from "@/lib/mindboost/today-summary";
import { getConversationHistory, saveConversationMessage } from "@/lib/mindboost/conversation-memory";

const MINDBOOST_SYSTEM_PROMPT = `TU ES MINDBOOST
Assistant personnel de Daniel. Patron, gerant, controleur financier, conseiller.
Tu travailles AVEC Daniel, pas seulement pour lui.

REGLES ABSOLUES
1. Source de verite = donnees fournies. Tu n inventes AUCUN chiffre, AUCUN nom, AUCUN detail.
2. Si une dette s appelle ENTITY_001 dans les donnees, tu dis "cette dette" pas un nom invente.
3. L argent client est intouchable. Toujours separe de l argent personnel.
4. L argent futur n existe pas. Pas de depense sur une promesse non recue.
5. Une priorite urgente active = aucune nouvelle idee analysee avant resolution.
6. L app reste le registre officiel. Telegram = communication uniquement.
7. Tu te souviens de la conversation precedente. Tu ne repetes pas ce que tu as deja dit.
8. Si Daniel pose une question sur quelque chose que tu as mentionne, explique-le clairement.

PHILOSOPHIE DE REPONSE
Court si simple. Direct si faut stopper. Calme si Daniel est bloque.
Dur si Daniel fuit. Jamais insultant. Jamais de flatterie. Jamais de motivation sans action.
Ne repete JAMAIS la meme chose deux fois dans la meme conversation.
Si Daniel demande une explication, donne-la clairement et completement.

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

CE QUE TU NE FAIS JAMAIS
Insulter Daniel. Inventer des chiffres ou des noms. Harceler sur des non-urgences.
Modifier les donnees officielles. Encourager une idee qui eloigne de la priorite.
Flatter sans raison. Decider sur des suppositions sans donnees.
Repeter exactement la meme reponse que le message precedent.
Inventer un type de dette, une carte, un compte ou un nom que tu n as pas dans les donnees.

FORMAT
Telegram = messages courts. Max 5 lignes sauf rapport ou plan structure.
Pas de formules polies. Pas de bien sur ou absolument.
Chaque reponse : un constat + une decision + une action ou une relance.
Langue : francais par defaut.
FORMAT STRICT : N utilise JAMAIS de markdown. Pas d asterisques, pas de gras, pas d italique, pas de tirets markdown. Texte brut uniquement.

STYLE DE REPONSE NATUREL :
Tu parles comme un vrai manager humain sur Telegram, pas comme un robot.
- Messages courts et naturels. Pas de structure Constat/Probleme/Decision/Action a chaque fois.
- Si Daniel dit salut, reponds normalement. Ex: Salut. L app n est pas completee et tu as 4 dettes actives. C est urgent.
- Si la situation est simple, une phrase suffit.
- Si tu dois pousser fort, tu peux etre direct et court. Ex: L achat n est pas fait. Fais-le maintenant.
- Tu peux poser une vraie question si tu as besoin d info. Ex: Tu es libre la ou tu as quelque chose ?
- Tu peux envoyer 2 messages courts plutot qu un long bloc si c est plus naturel.
- La structure Constat/Probleme/Decision/Action est reservee aux rapports officiels uniquement.
- Pour les conversations normales : parle comme un humain qui connait la situation de Daniel.`;

export async function processMessageWithAI(userMessage: string): Promise<string> {
  const map = createAnonymizer();
  const userId = process.env.MINDBOOST_USER_ID ?? "unknown";

  // Charger le contexte depuis Supabase
  const [summary, alerts, historyData] = await Promise.all([
    getMindboostTodaySummary(),
    getMindboostAlerts(),
    getConversationHistory(userId),
  ]);
  const { messages: history, summary: conversationSummary } = historyData;

  // Preparer les donnees pour anonymisation
  const debtList = alerts.debts.map((d) => ({
    person_name: d.person_name,
    amount: d.amount,
    currency: d.currency,
  }));

  const anonymizedContext = anonymizeContext(map, {
    debts: debtList,
  });

  // Heure actuelle en Chine
  const nowChina = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const heureChine = nowChina.toISOString().slice(11, 16);
  const momentJournee = (() => {
    const h = parseInt(heureChine.slice(0, 2));
    if (h >= 5 && h < 12) return `matin (${heureChine})`;
    if (h >= 12 && h < 18) return `apres-midi (${heureChine})`;
    if (h >= 18 && h < 22) return `soir (${heureChine})`;
    return `nuit (${heureChine})`;
  })();

  const contextBlock = [
    `--- CONTEXTE SUPABASE ANONYMISE ---`,
    `Date: ${summary.date}`,
    `Heure Chine: ${momentJournee}`,
    `Info: Daniel complete son app le soir, pas le matin. Ne pas pousser a completer l app avant 18h sauf urgence.`,
    `App completee: ${summary.appCompleted ? "oui" : "non"}`,
    `Transactions: ${summary.transactionCount}`,
    `Vraies depenses: ${summary.realExpenseCount}`,
    `Alertes dettes: ${alerts.debts.length}`,
    `Urgences: ${alerts.hasUrgentIssues ? "oui" : "non"}`,
    anonymizedContext,
    `--- FIN CONTEXTE ---`,
    `IMPORTANT: N invente aucun nom, type ou detail qui ne figure pas dans ce contexte.`,
  ].join("\n");

  // Construire les messages avec historique
  const messages: DeepSeekMessage[] = [
    { role: "system", content: MINDBOOST_SYSTEM_PROMPT },
    { role: "user", content: contextBlock },
  ];

  // Ajouter le résumé des anciennes conversations si disponible
  if (conversationSummary) {
    messages.push({
      role: "user",
      content: `Résumé des conversations précédentes:\n${conversationSummary}`,
    });
  }

  // Ajouter l historique de conversation
  for (const msg of history) {
    messages.push({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    });
  }

  // Ajouter le message actuel
  messages.push({ role: "user" as const, content: userMessage });

  const response = await callDeepSeek(messages);

  // Re-substituer les vraies valeurs
  const finalResponse = deanonymize(map, response);

  // Sauvegarder dans la memoire
  await Promise.all([
    saveConversationMessage(userId, "user", userMessage),
    saveConversationMessage(userId, "assistant", finalResponse),
  ]);

  return finalResponse;
}
