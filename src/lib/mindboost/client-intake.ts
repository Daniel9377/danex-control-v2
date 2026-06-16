import { createAdminClient } from "@/lib/supabase/admin";

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
  step: "confirm_existing" | "confirm_client" | "product" | "amount" | "supplier" | "price_china" | "delivery" | "contact" | "review" | "done";
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
      data: { client_name: clientName, step: "product" },
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

  await supabase
    .from("mindboost_client_intake")
    .update({ data: merged, updated_at: new Date().toISOString() })
    .eq("session_id", sessionId);
}

export async function closeIntakeSession(
  sessionId: string,
  status: "confirmed" | "cancelled"
): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("mindboost_client_intake")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("session_id", sessionId);
}

export async function createMindboostTask(
  userId: string,
  type: string,
  title: string,
  data: Record<string, unknown>
): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from("mindboost_tasks").insert({
    user_id: userId,
    type,
    title,
    data,
    status: "pending",
  });
}

export function getNextQuestion(data: ClientIntakeData): string {
  switch (data.step) {
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

export async function searchExistingClient(
  userId: string,
  name: string
): Promise<{ id: string; name: string } | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("clients")
    .select("id, name")
    .eq("user_id", userId)
    .ilike("name", `%${name}%`)
    .limit(1)
    .single();
  return data ?? null;
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

  // Step B — Create order
  const nextAction = data.client_contacted ? "Sourcer le produit" : "Contacter le client";
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
      status: "new",
      next_action: nextAction,
      note: "Créé via Mindboost intake",
    })
    .select("id")
    .single();
  if (orderErr) throw new Error(`Order creation error: ${orderErr.message}`);

  // Step C — Create transaction (advance received)
  const today = new Date().toISOString().slice(0, 10);
  await supabase.from("transactions").insert({
    user_id: userId,
    account_id: null,
    type: "income",
    amount: data.amount_received ?? 0,
    currency: data.currency_received ?? "CNY",
    sub_type: "client_money_received",
    client_id: clientId,
    order_id: order.id,
    accounting_type: "non_income_inflow",
    affects_physical_balance: false,
    transaction_date: today,
    note: `Avance reçue — ${data.client_name} — ${data.product ?? "produit"}`,
  });

  // Step D — Mindboost task log
  await supabase.from("mindboost_tasks").insert({
    user_id: userId,
    type: "client_order",
    title: `Commande ${data.client_name}`,
    data: { ...data, client_id: clientId, order_id: order.id },
    status: "pending",
  });

  if (isNewClient) {
    return `Client ${data.client_name} enregistré. Commande ${data.product ?? "produit"} créée. Avance ${data.amount_received ?? 0} ${data.currency_received ?? ""} enregistrée.\nStatut : sourcing en cours.`;
  }
  return `Nouvelle commande ajoutée pour ${data.client_name}. Avance enregistrée.`;
}

export async function updateIntakeClientName(sessionId: string, clientName: string): Promise<void> {
  const supabase = createAdminClient();
  await supabase
    .from("mindboost_client_intake")
    .update({ client_name: clientName, updated_at: new Date().toISOString() })
    .eq("session_id", sessionId);
}

const INTAKE_TRIGGER_PATTERNS = [
  /nouveau\s+client/i,
  /ajouter.{0,10}client/i,
  /j[e']?ai.{0,15}client/i,
  /cr[eé]er.{0,10}client/i,
  /new\s+client/i,
];

const NAME_AFTER_TRIGGER = /(?:nouveau\s+client|new\s+client|ajouter.{0,10}client|cr[eé]er.{0,10}client|j[e']?ai.{0,15}client)\s+([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ'-]*)/i;

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
  const name = clientName ?? "?";
  const step: ClientIntakeData["step"] = existingClientId
    ? "confirm_existing"
    : clientName
    ? "product"
    : "confirm_client";

  const sessionId = `intake_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const initialData: ClientIntakeData = {
    client_name: name,
    existing_client_id: existingClientId ?? null,
    step,
  };

  const { data, error } = await supabase
    .from("mindboost_client_intake")
    .insert({
      user_id: userId,
      session_id: sessionId,
      client_name: name,
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
