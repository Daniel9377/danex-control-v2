import { createAdminClient } from "@/lib/supabase/admin";

// Default account that receives client advances recorded via the Telegram intake.
// The intake conversation never asks which account the money landed in, so the
// advance is credited to this designated account. Matched case-insensitively
// and trimmed (the stored name may carry trailing spaces).
const DEFAULT_INTAKE_ACCOUNT_NAME = "Mercury";

/**
 * Resolve the account that should receive a client advance recorded via intake.
 * Prefers the designated default account when its currency matches the advance.
 * Falls back to the first account in the advance currency — crediting an account
 * of a different currency would corrupt its balance (no FX conversion happens on
 * balance updates anywhere in the app), so that case is never allowed.
 */
async function resolveIntakeAccount(
  supabase: ReturnType<typeof createAdminClient>,
  userId: string,
  currency: string
): Promise<{ id: string; balance: number } | null> {
  const { data: accounts } = await supabase
    .from("accounts")
    .select("id, name, currency, balance")
    .eq("user_id", userId);
  if (!accounts || accounts.length === 0) return null;

  const named = accounts.find(
    (a) => a.name.trim().toLowerCase() === DEFAULT_INTAKE_ACCOUNT_NAME.toLowerCase()
  );
  if (named && named.currency === currency) {
    return { id: named.id, balance: Number(named.balance) };
  }

  const sameCurrency = accounts.find((a) => a.currency === currency);
  if (sameCurrency) return { id: sameCurrency.id, balance: Number(sameCurrency.balance) };

  return null;
}

export type ClientIntakeData = {
  client_name: string;
  existing_client_id?: string | null;
  product?: string;
  amount_received?: number;
  currency_received?: string;
  supplier_known?: boolean;
  product_price_china?: number;
  delivery_address?: string;
  client_contacted?: boolean;
  blocker?: string;
  step: "confirm_create" | "confirm_existing" | "confirm_client" | "product" | "amount" | "supplier" | "price_china" | "delivery" | "contact" | "review" | "done";
};

export type ClientIntakeSession = {
  id: string;
  session_id: string;
  client_name: string;
  status: string;
  data: ClientIntakeData;
};

export async function getActiveIntakeSession(userId: string): Promise<ClientIntakeSession | null> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("mindboost_client_intake")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "collecting")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return data ?? null;
}

export async function createIntakeSession(
  userId: string,
  clientName: string
): Promise<ClientIntakeSession> {
  const supabase = createAdminClient();

  const sessionId = `intake_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const { data, error } = await supabase
    .from("mindboost_client_intake")
    .insert({
      user_id: userId,
      session_id: sessionId,
      client_name: clientName,
      status: "collecting",
      data: { client_name: clientName, step: "confirm_create" },
    })
    .select()
    .single();

  if (error) throw new Error(`Intake session error: ${error.message}`);
  return data;
}

export async function updateIntakeSession(
  sessionId: string,
  data: Partial<ClientIntakeData>
): Promise<void> {
  const supabase = createAdminClient();

  const { data: existing } = await supabase
    .from("mindboost_client_intake")
    .select("data")
    .eq("session_id", sessionId)
    .single();

  const merged = { ...(existing?.data ?? {}), ...data };

  const { error } = await supabase
    .from("mindboost_client_intake")
    .update({ data: merged, updated_at: new Date().toISOString() })
    .eq("session_id", sessionId);
  if (error) {
    console.error("[updateIntakeSession] update error:", error.code, error.message);
    throw new Error("Erreur lors de la sauvegarde de ta réponse. Réessaie.");
  }
}

export async function closeIntakeSession(
  sessionId: string,
  status: "confirmed" | "cancelled"
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("mindboost_client_intake")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("session_id", sessionId);
  if (error) {
    console.error("[closeIntakeSession] update error:", error.code, error.message);
    throw new Error("Erreur lors de la fermeture de la session.");
  }
}

export async function createMindboostTask(
  userId: string,
  type: string,
  title: string,
  data: Record<string, unknown>
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("mindboost_tasks").insert({
    user_id: userId,
    type,
    title,
    data,
    status: "pending",
  });
  if (error) {
    console.error("[createMindboostTask] insert error:", error.code, error.message);
    throw new Error(`Échec de la création du rappel de suivi : ${error.message}`);
  }
}

export function getNextQuestion(data: ClientIntakeData): string {
  switch (data.step) {
    case "confirm_create":
      return `Je ne trouve pas ${data.client_name} dans tes clients. Tu veux creer un nouveau client ${data.client_name} ? (oui / non)`;
    case "confirm_existing":
      return `J'ai trouvé ${data.client_name} dans l'app. Nouvelle commande pour ce client ? (oui / non)`;
    case "confirm_client":
      return "Quel est le nom du client ?";
    case "product":
      return `Quel produit ${data.client_name} a commandé ?`;
    case "amount":
      return `Combien ${data.client_name} a envoyé ? (montant et devise)`;
    case "supplier":
      return `Tu as déjà le fournisseur pour ce produit ?`;
    case "price_china":
      return `Le produit coûte combien en Chine ? (prix fournisseur)`;
    case "delivery":
      return `Adresse de livraison ou ville de destination ?`;
    case "contact":
      return `Tu as déjà envoyé une réponse à ${data.client_name} pour cette commande ?`;
    case "review":
      return buildReviewMessage(data);
    default:
      return "Infos complètes. Je crée la tâche de suivi.";
  }
}

function buildReviewMessage(data: ClientIntakeData): string {
  const lines = [
    `Recap commande ${data.client_name} :`,
    `Produit : ${data.product ?? "non renseigné"}`,
    `Montant reçu : ${data.amount_received ?? "?"} ${data.currency_received ?? ""}`,
    `Fournisseur : ${data.supplier_known ? "oui" : "non"}`,
    `Prix Chine : ${data.product_price_china ?? "non renseigné"}`,
    `Livraison : ${data.delivery_address ?? "non renseignée"}`,
    `Client contacté : ${data.client_contacted ? "oui" : "non"}`,
    ``,
    `Je confirme et crée la tâche ? (oui / non)`,
  ];
  return lines.join("\n");
}

function levenshtein(a: string, b: string): number {
  const la = Math.min(a.length, 20);
  const lb = Math.min(b.length, 20);
  const dp: number[][] = Array.from({ length: la + 1 }, (_, i) =>
    Array.from({ length: lb + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= la; i++) {
    for (let j = 1; j <= lb; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[la][lb];
}

export async function searchExistingClient(
  userId: string,
  name: string
): Promise<{ id: string; name: string } | null> {
  const supabase = createAdminClient();

  // Exact substring match first (fast path)
  const { data: exact } = await supabase
    .from("clients")
    .select("id, name")
    .eq("user_id", userId)
    .ilike("name", `%${name}%`)
    .limit(1)
    .single();
  if (exact) return exact;

  // Fuzzy fallback: load all client names and apply Levenshtein
  const { data: all } = await supabase
    .from("clients")
    .select("id, name")
    .eq("user_id", userId)
    .limit(50);
  if (!all || all.length === 0) return null;

  const input = name.toLowerCase();
  let best: { id: string; name: string } | null = null;
  let bestDist = Infinity;

  for (const client of all) {
    const cn = client.name.toLowerCase();
    if (cn.includes(input) || input.includes(cn)) return client;
    const dist = levenshtein(input, cn);
    if (dist <= 2 && dist < bestDist) {
      bestDist = dist;
      best = client;
    }
  }
  return best;
}

export async function createClientAndOrder(
  userId: string,
  data: ClientIntakeData
): Promise<string> {
  const supabase = createAdminClient();
  const existingId = data.existing_client_id ?? null;
  let clientId: string;
  let isNewClient = false;

  // Step A — Create client if not existing
  if (existingId) {
    clientId = existingId;
  } else {
    const { data: client, error: clientErr } = await supabase
      .from("clients")
      .insert({
        user_id: userId,
        name: data.client_name,
        city: data.delivery_address ?? null,
        trust_level: "standard",
      })
      .select("id")
      .single();
    if (clientErr) throw new Error(`Client creation error: ${clientErr.message}`);
    clientId = client.id;
    isNewClient = true;
  }

  // Step B — Create order (aligned with useOrders.addOrder — same fields, same order)
  const nextAction = data.client_contacted ? "Sourcer le produit" : "Contacter le client";
  const today = new Date().toISOString().slice(0, 10);
  const quantity = 1;
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      user_id: userId,
      client_id: clientId,
      product_name: data.product ?? "Non renseigné",
      currency: data.currency_received ?? "CNY",
      client_price: data.amount_received ?? 0,
      supplier_price: data.product_price_china ?? null,
      advance_received: data.amount_received ?? 0,
      quantity,
      status: "new",
      next_action: nextAction,
      note: "Créé via Mindboost intake",
      last_update: today,
    })
    .select("id")
    .single();
  if (orderErr || !order) throw new Error(orderErr?.message || "Order creation error");

  // Step B2 — Create order_items (migration 004: every order MUST have ≥1 item).
  // Pattern aligned with useOrders.addOrder — same fields, atomic rollback on failure.
  const { error: itemErr } = await supabase.from("order_items").insert({
    order_id: order.id,
    product_name: data.product ?? "Non renseigné",
    quantity,
    unit_price: data.amount_received ?? null,
    supplier_unit_cost: data.product_price_china ?? null,
  });
  if (itemErr) {
    console.error("[createClientAndOrder] order_items insert error:", itemErr.code, itemErr.message);
    // Rollback: don't leave an orphaned order
    await supabase.from("orders").delete().eq("id", order.id);
    throw new Error(`Order items creation error: ${itemErr.message}`);
  }

  // Step C — Create transaction (advance received) + credit the landing account.
  // The advance is real cash that arrived in an account, so it must increase a
  // physical account balance — exactly like a "client_money_received" recorded
  // from the web form.
  const advanceAmount = data.amount_received ?? 0;
  const advanceCurrency = data.currency_received ?? "CNY";

  const account = await resolveIntakeAccount(supabase, userId, advanceCurrency);
  if (!account) {
    throw new Error(
      `Aucun compte en ${advanceCurrency} trouvé pour enregistrer l'avance de ${data.client_name}.`
    );
  }

  const balanceAfter = account.balance + advanceAmount;

  const { error: txErr } = await supabase.from("transactions").insert({
    user_id: userId,
    account_id: account.id,
    type: "income",
    amount: advanceAmount,
    currency: advanceCurrency,
    sub_type: "client_money_received",
    client_id: clientId,
    order_id: order.id,
    accounting_type: "non_income_inflow",
    affects_physical_balance: true,
    balance_after: balanceAfter,
    transaction_date: today,
    note: `Avance reçue — ${data.client_name} — ${data.product ?? "produit"}`,
  });
  if (txErr) throw new Error(`Transaction creation error: ${txErr.message}`);

  // Balance update — must run after every received payment.
  const { error: balErr } = await supabase
    .from("accounts")
    .update({ balance: balanceAfter })
    .eq("id", account.id);
  if (balErr) throw new Error(`Account balance update error: ${balErr.message}`);

  // Step D — Mindboost task log (non-bloquant : client/commande/transaction OK)
  let taskWarning = "";
  try {
    const { error: taskErr } = await supabase.from("mindboost_tasks").insert({
      user_id: userId,
      type: "client_order",
      title: `Commande ${data.client_name}`,
      data: { ...data, client_id: clientId, order_id: order.id },
      status: "pending",
    });
    if (taskErr) {
      console.error("[createClientAndOrder] task insert error:", taskErr.code, taskErr.message);
      taskWarning = "\n⚠️ Le rappel de suivi n'a pas pu être créé — à vérifier manuellement.";
    }
  } catch {
    taskWarning = "\n⚠️ Le rappel de suivi n'a pas pu être créé — à vérifier manuellement.";
  }

  if (isNewClient) {
    return `Client ${data.client_name} enregistré. Commande ${data.product ?? "produit"} créée. Avance ${data.amount_received ?? 0} ${data.currency_received ?? ""} enregistrée.\nStatut : sourcing en cours.${taskWarning}`;
  }
  return `Nouvelle commande ajoutée pour ${data.client_name}. Avance enregistrée.${taskWarning}`;
}

export async function updateIntakeClientName(sessionId: string, clientName: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("mindboost_client_intake")
    .update({ client_name: clientName, updated_at: new Date().toISOString() })
    .eq("session_id", sessionId);
  if (error) {
    console.error("[updateIntakeClientName] update error:", error.code, error.message);
    // Non-fatal: DB keeps old name, bot uses new name in conversation text.
    // Downstream reporting may have the wrong name.
  }
}

const INTAKE_TRIGGER_PATTERNS = [
  /nouveau\s+cliente?/i,
  /nouvelle\s+cliente?/i,
  /ajouter.{0,10}cliente?/i,
  /j[e']?ai.{0,15}cliente?/i,
  /cr[eé]er.{0,10}cliente?/i,
  /new\s+client/i,
];

const NAME_AFTER_TRIGGER = /(?:nouveau\s+cliente?|nouvelle\s+cliente?|new\s+client|ajouter.{0,10}cliente?|cr[eé]er.{0,10}cliente?|j[e']?ai.{0,15}cliente?)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]*)/i;

export function detectIntakeTrigger(message: string): { triggered: boolean; clientName: string | null } {
  const triggered = INTAKE_TRIGGER_PATTERNS.some((p) => p.test(message));
  if (!triggered) return { triggered: false, clientName: null };
  const nameMatch = message.match(NAME_AFTER_TRIGGER);
  return { triggered: true, clientName: nameMatch?.[1] ?? null };
}

export async function startIntakeSession(
  userId: string,
  clientName: string | null,
  existingClientId?: string | null
): Promise<{ session: ClientIntakeSession; firstQuestion: string }> {
  const supabase = createAdminClient();

  // If an existing client was matched, fetch their canonical name from the DB
  let resolvedName = clientName ?? "?";
  if (existingClientId) {
    const { data: found } = await supabase
      .from("clients")
      .select("name")
      .eq("id", existingClientId)
      .single();
    if (found?.name) resolvedName = found.name;
  }

  const step: ClientIntakeData["step"] = existingClientId
    ? "confirm_existing"
    : clientName
    ? "product"
    : "confirm_client";

  const sessionId = `intake_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const initialData: ClientIntakeData = {
    client_name: resolvedName,
    existing_client_id: existingClientId ?? null,
    step,
  };

  const { data, error } = await supabase
    .from("mindboost_client_intake")
    .insert({
      user_id: userId,
      session_id: sessionId,
      client_name: resolvedName,
      status: "collecting",
      data: initialData,
    })
    .select()
    .single();

  if (error) throw new Error(`Intake session error: ${error.message}`);
  const firstQuestion = getNextQuestion(initialData);
  return { session: data as ClientIntakeSession, firstQuestion };
}

export function detectClientMention(message: string): string | null {
  const patterns = [
    /(?:cliente?|client)\s+([A-Za-zÀ-ÿ]+)/i,
    /([A-Za-zÀ-ÿ]+)\s+(?:a payé|a envoyé|a commandé|a déposé)/i,
    /commande\s+(?:de\s+)?([A-Za-zÀ-ÿ]+)/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}
