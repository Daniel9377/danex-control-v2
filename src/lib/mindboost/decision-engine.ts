import { callDeepSeek, type DeepSeekMessage } from "@/lib/mindboost/deepseek";
import { createAnonymizer, anonymizeContext, deanonymize } from "@/lib/mindboost/anonymizer";
import { getMindboostAlerts } from "@/lib/mindboost/alerts";
import { getMindboostTodaySummary } from "@/lib/mindboost/today-summary";
import { getConversationHistory, saveConversationMessage, saveConversationSummary } from "@/lib/mindboost/conversation-memory";
import { getActiveIntakeSession, createIntakeSession, updateIntakeSession, closeIntakeSession, createMindboostTask, createClientAndOrder, getNextQuestion, detectClientMention, updateIntakeClientName, type ClientIntakeData } from "@/lib/mindboost/client-intake";

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

IDENTITE ET TON :
Tu es un systeme de controle personnel. Pas un ami. Pas un serviteur.
Tu parles comme un patron qui connait tous les chiffres et qui n a pas de temps a perdre.
Tu es direct, sec, factuel. Tu ne consoles pas. Tu ne negocie pas sur les priorites claires.
Tu ne fais pas la conversation inutile. Si Daniel parle de quelque chose hors scope : une phrase pour ramener au sujet, pas de discussion.

REGLES DE TON :
- Pas de salutations inutiles. Si Daniel dit salut, tu repondas avec la situation reelle directement.
- Pas d encouragement vide. Jamais de bien joue ou tu peux le faire.
- Si Daniel est fatigue : tu reconnais en une phrase, puis tu donnes quand meme la prochaine action.
- Si Daniel dit d accord : tu fixes la prochaine action et l heure de relance precise.
- Si Daniel est vraiment bloque : tu baisses le ton, tu poses 3 questions, tu donnes un plan simple.
- Tes messages sont courts. Maximum 4 lignes sauf rapport officiel.
- Tu ne poses qu une seule question par message.
- Tu fixes toujours une relance precise quand une action est demandee.
- Quand Daniel mentionne un client, une commande ou un paiement qui n est pas dans les donnees : tu le signales et tu proposes de l ajouter.
- Tu es dur sur les priorites mais pas cruel. Tu critiques le comportement, jamais la personne.`;

export async function processMessageWithAI(userMessage: string): Promise<string> {
  const map = createAnonymizer();
  const userId = process.env.MINDBOOST_USER_ID ?? "unknown";

  // Verifier session intake active
  const activeIntake = await getActiveIntakeSession(userId);
  if (activeIntake) {
    return await processIntakeResponse(activeIntake.session_id, activeIntake.client_name, activeIntake.data as ClientIntakeData, userMessage, userId);
  }

  // Charger le contexte depuis Supabase
  const [summary, alerts, historyData] = await Promise.all([
    getMindboostTodaySummary(),
    getMindboostAlerts(),
    getConversationHistory(userId),
  ]);
  const { messages: history, summary: conversationSummary } = historyData;

  // Preparer les donnees pour anonymisation
  const iOwe = alerts.debts.filter((d) => d.direction === "i_owe");
  const owesMe = alerts.debts.filter((d) => d.direction === "owes_me");

  const iOweList = iOwe.map((d) => ({
    person_name: d.person_name,
    amount: d.amount,
    currency: d.currency,
  }));

  const owesMeList = owesMe.map((d) => ({
    person_name: d.person_name,
    amount: d.amount,
    currency: d.currency,
  }));

  const anonymizedContext = anonymizeContext(map, {
    debts: iOweList,
    owesMe: owesMeList,
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
  // Detecter mention client non enregistre
  const mentionedClient = detectClientMention(userMessage);
  let enrichedMessage = userMessage;
  if (mentionedClient) {
    enrichedMessage = `${userMessage}\n\n[SYSTEME: Client mentionne: "${mentionedClient}". Si ce client ou cette commande ne figure pas dans les donnees Supabase, propose de creer une session de suivi en disant exactement: NOUVEAU_CLIENT:${mentionedClient}]`;
  }

  messages.push({ role: "user" as const, content: enrichedMessage });

  const response = await callDeepSeek(messages);

  // Detecter si DeepSeek veut creer un nouveau client
  let finalResponse = deanonymize(map, response);
  const newClientMatch = finalResponse.match(/NOUVEAU_CLIENT:(\S+)/);
  if (newClientMatch) {
    const clientName = newClientMatch[1].trim();
    await createIntakeSession(userId, clientName);
    finalResponse = finalResponse.replace(/NOUVEAU_CLIENT:\S+/, "").trim();
    if (!finalResponse) {
      finalResponse = `Je ne trouve pas ${clientName} dans l app. Je lance la collecte des infos.\n\nQuel produit ${clientName} a commandé ?`;
    }
  }

  // Sauvegarder dans la memoire
  const exchangeSummary = `Daniel: ${userMessage}\nMindboost: ${finalResponse}`;
  await Promise.all([
    saveConversationMessage(userId, "user", userMessage),
    saveConversationMessage(userId, "assistant", finalResponse),
    saveConversationSummary(userId, exchangeSummary),
  ]);

  return finalResponse;
}

async function processIntakeResponse(
  sessionId: string,
  clientName: string,
  data: ClientIntakeData,
  userMessage: string,
  userId: string
): Promise<string> {
  const msg = userMessage.trim().toLowerCase();
  const updates: Partial<ClientIntakeData> = {};
  let nextStep: ClientIntakeData["step"] = data.step;

  switch (data.step) {
    case "confirm_existing": {
      const confirmed = /oui|yes|ok/i.test(msg);
      if (confirmed) {
        nextStep = "product";
      } else {
        // Refus : on repart comme nouveau client, on efface l'id existant
        updates.existing_client_id = null;
        nextStep = "product";
      }
      break;
    }

    case "confirm_client": {
      const newName = userMessage.trim();
      updates.client_name = newName;
      await updateIntakeClientName(sessionId, newName);
      nextStep = "product";
      break;
    }

    case "product":
      updates.product = userMessage.trim();
      nextStep = "amount";
      break;

    case "amount": {
      const CURRENCY_RE = /(\d+(?:[.,]\d+)?)\s*(USD|CNY|RMB|CDF|THB|EUR|€|\$|¥)/i;
      const directMatch = userMessage.match(CURRENCY_RE);
      if (directMatch) {
        updates.amount_received = parseFloat(directMatch[1].replace(",", "."));
        updates.currency_received = directMatch[2].toUpperCase().replace("$", "USD").replace("€", "EUR").replace("¥", "CNY");
      } else {
        // Take the largest number in the message as the amount
        const allNums = [...userMessage.matchAll(/(\d+(?:[.,]\d+)?)/g)].map((m) =>
          parseFloat(m[1].replace(",", "."))
        );
        if (allNums.length === 0) {
          return `Format pas reconnu. Donne le montant et la devise. Exemple : 35000 USD`;
        }
        updates.amount_received = Math.max(...allNums);
        // Try to infer currency from context words
        const inferredCurrency = /dollar|\bUSD\b|\b\$\b/i.test(userMessage) ? "USD"
          : /yuan|rmb|\bCNY\b/i.test(userMessage) ? "CNY"
          : /franc.{0,5}congolais|\bCDF\b/i.test(userMessage) ? "CDF"
          : /euro|\bEUR\b|€/i.test(userMessage) ? "EUR"
          : /baht|\bTHB\b/i.test(userMessage) ? "THB"
          : null;
        if (!inferredCurrency) {
          return `Montant de ${updates.amount_received} retenu. Quelle devise ? (USD, CNY, CDF, EUR…)`;
        }
        updates.currency_received = inferredCurrency;
      }
      nextStep = "supplier";
      break;
    }

    case "supplier":
      updates.supplier_known = /oui|yes|j.?ai|déjà|deja/i.test(msg);
      nextStep = "price_china";
      break;

    case "price_china": {
      const priceMatch = userMessage.match(/(\d+(?:[.,]\d+)?)/);
      updates.product_price_china = priceMatch ? parseFloat(priceMatch[1].replace(",", ".")) : undefined;
      nextStep = "delivery";
      break;
    }

    case "delivery":
      updates.delivery_address = userMessage.trim();
      nextStep = "contact";
      break;

    case "contact":
      updates.client_contacted = /oui|yes|déjà|deja/i.test(msg);
      nextStep = "review";
      break;

    case "review": {
      const confirmed =
        ["oui", "yes", "ok", "confirme", "c'est bon", "cest bon"].includes(msg) ||
        /\boui\b|\byes\b|\bok\b|\bconfirme\b/i.test(msg);
      if (confirmed) {
        try {
          const confirmMsg = await createClientAndOrder(userId, data);
          await closeIntakeSession(sessionId, "confirmed");
          return confirmMsg;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : "Erreur inconnue";
          return `Erreur lors de l'enregistrement : ${errMsg}. Reessaie ou contacte le support.`;
        }
      } else {
        await closeIntakeSession(sessionId, "cancelled");
        return `Session annulée.`;
      }
    }

    default:
      return getNextQuestion(data);
  }

  updates.step = nextStep;
  await updateIntakeSession(sessionId, updates);
  return getNextQuestion({ ...data, ...updates });
}
