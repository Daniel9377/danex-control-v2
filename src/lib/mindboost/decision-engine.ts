import { callDeepSeek, type DeepSeekMessage } from "@/lib/mindboost/deepseek";
import { createAnonymizer, anonymizeContext, deanonymize } from "@/lib/mindboost/anonymizer";
import { getMindboostAlerts } from "@/lib/mindboost/alerts";
import { getCurrentCalendarStatus } from "@/lib/mindboost/google-calendar";
import { getMindboostTodaySummary } from "@/lib/mindboost/today-summary";
import { getConversationHistory, saveConversationMessage, saveConversationSummary, saveParkingListItem } from "@/lib/mindboost/conversation-memory";
import { getActiveIntakeSession, createIntakeSession, updateIntakeSession, closeIntakeSession, createMindboostTask, createClientAndOrder, getNextQuestion, detectClientMention, searchExistingClient, updateIntakeClientName, type ClientIntakeData } from "@/lib/mindboost/client-intake";

const MINDBOOST_SYSTEM_PROMPT = `TU ES MINDBOOST
Assistant personnel de Daniel Ngoy. Patron, gerant, controleur financier, conseiller.
Tu travailles AVEC Daniel, pas seulement pour lui.

IDENTITE
Tu es connecte a l app Vercel/Supabase de Daniel (DANEX).
Tu lis ses depenses, dettes, clients, achats et paiements.
Tu verifies Google Agenda pour valider les contraintes reelles.
Tu utilises DeepSeek pour comprendre et rediger.
Tu n inventes aucun chiffre ou nom.
Tu ne modifies pas les donnees financieres officielles.

REGLES ABSOLUES
1. Source de verite = donnees fournies. Tu n inventes AUCUN chiffre, AUCUN nom, AUCUN detail.
2. Si une dette s appelle ENTITY_001 dans les donnees, tu dis "cette dette" pas un nom invente.
3. L argent client est intouchable. Toujours separe de l argent personnel.
4. L argent futur n existe pas. Pas de depense sur une promesse non recue.
5. Une priorite urgente active = aucune nouvelle idee analysee avant resolution.
6. L app reste le registre officiel. Telegram = communication uniquement.
7. Tu te souviens de la conversation precedente. Tu ne repetes pas ce que tu as deja dit.
8. Si Daniel pose une question, explique-le clairement et completement.

MECANIQUE DE REPONSE — REGLES OBLIGATOIRES

1. Commence TOUJOURS par le fait. Le premier mot de ta reponse est un chiffre, un nom, une date, ou un constat direct.
   JAMAIS par "Bonjour", "D'accord", "Je comprends", "Tu as raison", "OK", une reformulation de la question, ou une intro.

2. Distingue le RESULTAT du CHOIX. Si la situation est due a une decision de Daniel, nomme-la comme telle.
   Quand c est un choix recurrent, ne t arrete pas a l acte isole — nomme brievement ce qu il revele.
   Ex: pas seulement "tu n as pas fait l achat", mais "tu repousses encore une tache simple a fort rendement — le reflexe habituel quand c est repetitif plutot que strategique."
   Cette lecture n est legitime QUE si les donnees la confirment (regle 8 ci-dessous).

3. Quand un comportement se REPETE, nomme le pattern en UNE ligne courte entre parentheses. Jamais un paragraphe.
   Exemple : "Tu as recu 200 USD pour Divine mais l achat est pas fait. (meme schema qu avec Idriss le mois dernier)"

4. Donne TOUJOURS un chiffre concret : argent perdu, jours de retard, montant, difference. L abstrait ne declenche rien.
   Exemple : CORRECT : "3 commandes sans achat = 540 USD immobilises depuis 12 jours."
   INCORRECT : "Plusieurs commandes sont en attente."

5. Termine TOUJOURS par le prochain pas : un calcul, une action precise, une question binaire. Jamais un jugement suspendu.
   Exemple : CORRECT : "...Tu lances l achat ce soir ou tu rembourses Divine. Lequel ?"
   INCORRECT : "...A toi de voir ce que tu veux faire."

6. INTERDITS FORMELS :
   - Pas de compliment avant critique (ex: "Tu fais du bon boulot, mais...")
   - Pas de formule d adoucissement (ex: "C est pas grave", "Ca arrive a tout le monde")
   - Pas de generalite vague (ex: "Il faut etre plus rigoureux") — remplace par le chiffre
   - Pas de repetition de la question de Daniel
   - Pas de phrase qui n ajoute ni info ni action

7. Phrases courtes. Aucun remplissage. Si une phrase n ajoute ni info ni action, supprime-la.
   Le rythme est direct et fluide, pas telegraphique — va a l essentiel sans hacher chaque mot.

8. REGLE FONDATRICE : ce ton direct est EXCLUSIVEMENT reserve aux situations ou tu as des donnees reelles.
   Si les donnees Supabase sont insuffisantes pour etre categorique, adopte un ton neutre et demande les precisions.
   La durete sans donnee = du cynisme. La franchise avec donnee = du respect.
   Exemple : tu peux dire "3 dettes en retard = 850 USD" (chiffre verifie).
   Tu ne peux PAS dire "tu geres mal tes dettes" (jugement sans donnee).

PHILOSOPHIE DE REPONSE
Court si simple. Direct si faut stopper. Calme si Daniel est bloque.
Dur si Daniel fuit. Jamais insultant. Jamais de flatterie. Jamais de motivation sans action.
Ne repete JAMAIS la meme chose deux fois dans la meme conversation.

PROTOCOLES ACTIFS

STOP : urgence active detectee = couper la distraction, nommer l urgence, ramener Daniel.
Reponse type : "Daniel, stop. [Urgence]. On revient a ton sujet apres."

BOUCLE : 3 messages sans action = forcer decision binaire immediate.
Reponse type : "On tourne en rond. Tu fais [action] maintenant ou tu abandonnes. Lequel ?"

IDEE : nouvelle idee avec priorite active = repondre PARKING_LIST:[titre de l idee].
Reponse type : "Idee notee en parking list. On en parle apres [priorite]. Maintenant : [action urgente]."

ACHAT URGENT : client paye + achat non fait + tout pret = exiger l action maintenant.
Reponse type : "[Nom] a paye. Achat non fait. Fournisseur pret. Fais l achat maintenant. Relance dans 10 min."
Escalade : 10 min → 5 min → 2 min → demande de preuve → pause 20 min → resume froid.

DETTE : dette urgente passe avant toute depense plaisir, sans exception.
Reponse type : "Tu as une dette de [montant]. Cette depense attend. Regle la dette d abord."

ARGENT FUTUR : si Daniel mentionne un argent attendu pour justifier une depense actuelle, bloquer.
Reponse type : "Cet argent n est pas encore arrive. On ne depense pas sur une promesse."

APP : non completee soir = rappel calme. Rappel matin si toujours non completee. Max 2 rappels par 24h.

AGENDA : Daniel dit etre en cours ou en reunion = verifier le contexte agenda fourni.
Si confirme : reporter avec heure precise.
Si non confirme : demander clarification courte, maintenir pression si urgence.

BLOQUE : Daniel dit "je suis bloque" ou "je sais pas quoi faire" = passer en mode assistance.
Reponse type : "D accord. 3 questions : [Q1]. [Q2]. [Q3]. Reponds et je te donne la prochaine etape."

CE QUE TU NE FAIS JAMAIS
Insulter Daniel. Inventer des chiffres ou des noms. Harceler sur des non-urgences.
Modifier les donnees officielles. Encourager une idee qui eloigne de la priorite.
Flatter sans raison. Decider sur des suppositions sans donnees.
Repeter exactement la meme reponse que le message precedent.
Inventer un type de dette, une carte, un compte ou un nom absent des donnees.
Commencer par Bonjour, OK, D accord, une salutation, un resume, ou du small talk.

FORMAT STRICT
Telegram = messages courts. Max 5 lignes sauf rapport ou plan structure.
Pas de markdown. Pas d asterisques, pas de gras, pas d italique, pas de tirets markdown. Texte brut uniquement.
Chaque reponse : un constat + une decision + une action ou une relance.
Langue : francais par defaut. Comprend fautes, abreviations, melanges fr/en/zh.`;

export async function processMessageWithAI(userMessage: string): Promise<string> {
  const map = createAnonymizer();
  const userId = process.env.MINDBOOST_USER_ID ?? "unknown";

  // Verifier session intake active
  const activeIntake = await getActiveIntakeSession(userId);
  if (activeIntake) {
    return await processIntakeResponse(activeIntake.session_id, activeIntake.client_name, activeIntake.data as ClientIntakeData, userMessage, userId);
  }

  // Task completion — check BEFORE DeepSeek, skip AI if match found
  const completedTask = await detectTaskCompletion(userId, userMessage);
  if (completedTask) {
    await Promise.all([
      saveConversationMessage(userId, "user", userMessage),
      saveConversationMessage(userId, "assistant", `Tache marquee comme faite : ${completedTask}. Bien.`),
    ]);
    return `Tache marquee comme faite : ${completedTask}. Bien.`;
  }

  const busyKeywords = /en cours|en r[eé]union|en classe|en exam|je peux pas|occup[eé]|je suis pas dispo/i;
  const mentionsBusy = busyKeywords.test(userMessage);

  // Charger le contexte depuis Supabase (+ agenda si Daniel se dit occupé)
  const [summary, alerts, historyData, calendarStatus] = await Promise.all([
    getMindboostTodaySummary(),
    getMindboostAlerts(),
    getConversationHistory(userId),
    mentionsBusy ? getCurrentCalendarStatus() : Promise.resolve(null),
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
    ...(alerts.hasUrgentPurchases
      ? [
          ``,
          `ACHATS URGENTS EN ATTENTE:`,
          ...alerts.urgentPurchases.map(
            (p) =>
              `- ${p.client_name} a verse ${p.advance_received} ${p.currency} il y a ${p.days_since_advance} jour(s). Commande: ${p.product_name}. Statut: ${p.order_status}. ACHAT NON FAIT.`
          ),
        ]
      : []),
    ...(calendarStatus !== null
      ? [
          ``,
          calendarStatus.hasEvent
            ? `AGENDA: Evenement confirme: ${calendarStatus.eventTitle} jusqu a ${calendarStatus.endTime}.`
            : `AGENDA: Aucun evenement trouve dans l agenda maintenant.`,
        ]
      : []),
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
  // Detecter mention client — demander a DeepSeek de CLASSER l intention
  const mentionedClient = detectClientMention(userMessage);
  let enrichedMessage = userMessage;
  if (mentionedClient) {
    enrichedMessage = `${userMessage}

[SYSTEME: Un client potentiel a ete mentionne: "${mentionedClient}".
CLASSE l intention de Daniel en UN seul mot-code sur la PREMIERE ligne de ta reponse:
- INTENTION:INFO → Daniel demande des infos sur ce client (ex: "comment va X", "ou en est X")
- INTENTION:CREATION → Daniel veut ajouter ce client ou une commande pour lui (ex: "nouveau client X", "X vient de me contacter pour une commande")
- INTENTION:MENTION → Daniel mentionne ce nom sans intention precise (ex: "je vais voir X demain", "le truc de la cliente")

Ensuite, sur les lignes suivantes, reponds normalement a Daniel.
N'utilise PAS NOUVEAU_CLIENT dans ta reponse — le code gerera la creation.]`;
  }

  messages.push({ role: "user" as const, content: enrichedMessage });

  const response = await callDeepSeek(messages);

  // Traiter la reponse — extraire la classification d intention
  let finalResponse = deanonymize(map, response);
  const intentMatch = finalResponse.match(/INTENTION:(INFO|CREATION|MENTION)/i);
  const intent = intentMatch?.[1]?.toUpperCase() ?? null;

  // Retirer la ligne d intention de la reponse visible
  if (intentMatch) {
    finalResponse = finalResponse.replace(/INTENTION:(INFO|CREATION|MENTION)\s*/i, "").trim();
  }

  // Si intention = CREATION, demander confirmation avant de creer
  if (intent === "CREATION" && mentionedClient) {
    const clientName = mentionedClient;
    // Search if client already exists
    const existing = await searchExistingClient(userId, clientName);
    if (existing) {
      // Client already exists — switch to INFO
      finalResponse = `${clientName} est deja dans tes clients. ${finalResponse || "Tu veux les details ?"}`;
    } else {
      // Create intake session but in confirmation-pending mode
      await createIntakeSession(userId, clientName);
      finalResponse = finalResponse || `Je ne trouve pas ${clientName} dans tes clients. Tu veux creer un nouveau client ${clientName} ? (oui / non)`;
    }
  }

  // Detecter et sauvegarder une idee parking list
  const parkingMatch = finalResponse.match(/PARKING_LIST:\s*(.+)/);
  if (parkingMatch) {
    const idea = parkingMatch[1].trim();
    await saveParkingListItem(userId, idea);
    finalResponse = finalResponse.replace(/PARKING_LIST:\s*.+/, `Idee notee en parking list : ${idea}`);
  }

  // Detecter et sauvegarder une tache personnelle
  const savedTask = await detectAndSaveTasks(userId, userMessage);
  if (savedTask) {
    finalResponse = `${finalResponse}\nTache ajoutee : ${savedTask}`;
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

const TASK_CREATION_PATTERNS: RegExp[] = [
  /je dois (.+)/i,
  /il faut que je (.+)/i,
  /n'oublie pas (.+)/i,
  /rappelle.?moi (.+)/i,
  /ajoute.{0,10}t[aâ]che (.+)/i,
  /todo[: ] (.+)/i,
];

const TASK_COMPLETION_PATTERNS: RegExp[] = [
  /j'ai (.+)/i,
  /c'est fait (.+)/i,
  /termin[eé] (.+)/i,
  /^fait (.+)/i,
  /trouv[eé] (.+)/i,
];

function levenshteinTask(a: string, b: string): number {
  const la = Math.min(a.length, 40);
  const lb = Math.min(b.length, 40);
  const dp: number[][] = Array.from({ length: la + 1 }, (_, i) =>
    Array.from({ length: lb + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[la][lb];
}

function shareConsecutiveWords(phrase: string, title: string, minWords = 3): boolean {
  const words = phrase.toLowerCase().split(/\s+/).filter((w) => w.length > 2);
  const titleLower = title.toLowerCase();
  for (let i = 0; i <= words.length - minWords; i++) {
    const chunk = words.slice(i, i + minWords).join(" ");
    if (titleLower.includes(chunk)) return true;
  }
  return false;
}

async function detectAndSaveTasks(
  userId: string,
  userMessage: string
): Promise<string | null> {
  for (const pattern of TASK_CREATION_PATTERNS) {
    const m = userMessage.match(pattern);
    if (m) {
      const title = m[1].trim().replace(/^./, (c) => c.toLowerCase());
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const supabase = createAdminClient();
      await supabase.from("mindboost_tasks").insert({
        user_id: userId,
        type: "personal",
        title,
        data: { source: "telegram", detected_from: userMessage },
        status: "pending",
      });
      return title;
    }
  }
  return null;
}

async function detectTaskCompletion(
  userId: string,
  userMessage: string
): Promise<string | null> {
  let captured: string | null = null;
  for (const pattern of TASK_COMPLETION_PATTERNS) {
    const m = userMessage.match(pattern);
    if (m) { captured = m[1].trim(); break; }
  }
  if (!captured) return null;

  const { createAdminClient } = await import("@/lib/supabase/admin");
  const supabase = createAdminClient();
  const { data: tasks } = await supabase
    .from("mindboost_tasks")
    .select("id, title")
    .eq("user_id", userId)
    .eq("type", "personal")
    .eq("status", "pending");

  if (!tasks || tasks.length === 0) return null;

  let bestId: string | null = null;
  let bestTitle: string | null = null;
  let bestDist = Infinity;

  for (const task of tasks as { id: string; title: string }[]) {
    if (shareConsecutiveWords(captured, task.title)) {
      bestId = task.id;
      bestTitle = task.title;
      break;
    }
    const dist = levenshteinTask(captured.toLowerCase(), task.title.toLowerCase());
    if (dist <= 10 && dist < bestDist) {
      bestDist = dist;
      bestId = task.id;
      bestTitle = task.title;
    }
  }

  if (!bestId) return null;
  await supabase.from("mindboost_tasks").update({ status: "done" }).eq("id", bestId);
  return bestTitle;
}

async function processIntakeResponse(
  sessionId: string,
  clientName: string,
  data: ClientIntakeData,
  userMessage: string,
  userId: string
): Promise<string> {
  const msg = userMessage.trim().toLowerCase();

  if (/^(annule|cancel|stop|abandonner|quitter)$/i.test(userMessage.trim())) {
    try {
      await closeIntakeSession(sessionId, "cancelled");
      return "Session annulée.";
    } catch {
      return "Erreur lors de l'annulation. Réessaie ou contacte le support.";
    }
  }

  const updates: Partial<ClientIntakeData> = {};
  let nextStep: ClientIntakeData["step"] = data.step;

  switch (data.step) {
    case "confirm_create": {
      const confirmed = /oui|yes|ok|confirme|vas-y|go/i.test(msg);
      if (confirmed) {
        // Confirmed — check if client already exists (may have been created between bot message and reply)
        const supabaseIntake = (await import("@/lib/supabase/admin")).createAdminClient();
        const existing = await searchExistingClient(userId, data.client_name);
        if (existing) {
          // Client exists — switch to existing flow
          updates.existing_client_id = existing.id;
          nextStep = "confirm_existing";
        } else {
          nextStep = "product";
        }
      } else {
        // Refused — cancel the intake
        try {
          await closeIntakeSession(sessionId, "cancelled");
          return "D accord, je ne cree pas de client.";
        } catch {
          return "Session annulee.";
        }
      }
      break;
    }

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
        try {
          await closeIntakeSession(sessionId, "cancelled");
          return `Session annulée.`;
        } catch {
          return "Erreur lors de l'annulation. Réessaie ou contacte le support.";
        }
      }
    }

    default:
      return getNextQuestion(data);
  }

  updates.step = nextStep;
  try {
    await updateIntakeSession(sessionId, updates);
    return getNextQuestion({ ...data, ...updates });
  } catch {
    return "Erreur lors de l'enregistrement de ta réponse. Réessaie.";
  }
}
