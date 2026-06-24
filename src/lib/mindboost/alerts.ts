import { createAdminClient } from "@/lib/supabase/admin";
import type { Debt, Transaction } from "@/lib/supabase/types";

export type UrgentPurchaseAlert = {
  client_id: string;
  client_name: string;
  order_id: string;
  product_name: string;
  advance_received: number;
  currency: string;
  order_status: string;
  days_since_advance: number;
};

export type AlertsReport = {
  date: string;
  debts: DebtAlert[];
  clientMoney: ClientMoneyAlert[];
  urgentPurchases: UrgentPurchaseAlert[];
  hasUrgentIssues: boolean;
  hasUrgentPurchases: boolean;
  message: string;
};

type DebtAlert = {
  id: string;
  person_name: string;
  direction: string;
  amount: number;
  currency: string;
  daysOld: number;
  status: string;
  due_date: string | null;
  daysUntilDue: number | null; // negative = overdue, positive = days left, null = no due date
};

type ClientMoneyAlert = {
  client_id: string;
  totalReceived: number;
  totalSpent: number;
  balance: number;
  currency: string;
  daysOld: number;
};

export async function wasUrgentPurchaseAlertSent(userId: string, orderId: string): Promise<boolean> {
  const { createAdminClient: admin } = await import("@/lib/supabase/admin");
  const supabase = admin();
  const { data } = await supabase
    .from("mindboost_memory")
    .select("expires_at")
    .eq("user_id", userId)
    .eq("memory_type", `urgent_purchase_alert_${orderId}`)
    .single();
  if (!data) return false;
  return !data.expires_at || new Date(data.expires_at as string) > new Date();
}

export async function markUrgentPurchaseAlertSent(userId: string, orderId: string): Promise<void> {
  const { createAdminClient: admin } = await import("@/lib/supabase/admin");
  const supabase = admin();
  const endOfDay = new Date();
  endOfDay.setUTCHours(23, 59, 59, 999);
  const { error } = await supabase.from("mindboost_memory").upsert(
    {
      user_id: userId,
      memory_type: `urgent_purchase_alert_${orderId}`,
      content: JSON.stringify({ sent_at: new Date().toISOString() }),
      relevance_score: 1,
      expires_at: endOfDay.toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,memory_type" }
  );
  if (error) {
    console.error("[markUrgentPurchaseAlertSent] upsert error:", error.code, error.message);
    // Non-fatal: sentinel not set → alert may fire again at next poll.
    // User gets duplicate notification — annoying but not destructive.
  }
}

function daysSince(dateStr: string): number {
  const now = new Date();
  const then = new Date(dateStr);
  return Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24));
}

export async function getUrgentPurchaseAlerts(userId: string): Promise<UrgentPurchaseAlert[]> {
  const supabase = createAdminClient();

  const { data: orders } = await supabase
    .from("orders")
    .select("id, client_id, product_name, advance_received, currency, status")
    .eq("user_id", userId)
    .in("status", ["new", "sourcing", "ordered"])
    .gt("advance_received", 0);

  if (!orders || orders.length === 0) return [];

  const results: UrgentPurchaseAlert[] = [];

  for (const order of orders) {
    // Get client name
    const { data: client } = await supabase
      .from("clients")
      .select("name")
      .eq("id", order.client_id)
      .single();

    // Get most recent client_money_received transaction for this order
    const { data: txRows } = await supabase
      .from("transactions")
      .select("transaction_date")
      .eq("order_id", order.id)
      .eq("sub_type", "client_money_received")
      .order("transaction_date", { ascending: false })
      .limit(1);

    const txDate = txRows?.[0]?.transaction_date ?? null;
    if (!txDate) continue;

    const days = daysSince(txDate);
    if (days < 1) continue;

    results.push({
      client_id: order.client_id,
      client_name: client?.name ?? "Client inconnu",
      order_id: order.id,
      product_name: order.product_name,
      advance_received: Number(order.advance_received),
      currency: order.currency,
      order_status: order.status,
      days_since_advance: days,
    });
  }

  return results.sort((a, b) => b.days_since_advance - a.days_since_advance);
}

export async function getMindboostAlerts(): Promise<AlertsReport> {
  const userId = process.env.MINDBOOST_USER_ID;
  if (!userId) throw new Error("Missing env var: MINDBOOST_USER_ID");

  const supabase = createAdminClient();
  const today = new Date().toISOString().slice(0, 10);

  const { data: debtsData, error: debtsError } = await supabase
    .from("debts")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["unpaid", "partial"]);

  if (debtsError) throw new Error(`Supabase debts error: ${debtsError.message}`);

  const debts = (debtsData ?? []) as Debt[];

  const debtAlerts: DebtAlert[] = debts
    .map((d) => {
      const daysUntilDue = d.due_date
        ? Math.ceil((new Date(d.due_date).getTime() - Date.now()) / 86400000)
        : null;
      return {
        id: d.id,
        person_name: d.person_name,
        direction: d.direction,
        amount: d.amount - d.paid_amount,
        currency: d.currency,
        daysOld: daysSince(d.created_at),
        status: d.status,
        due_date: d.due_date ?? null,
        daysUntilDue,
      };
    })
    .filter((d) => {
      // Only include if overdue, near-due (within 14 days), OR high amount (>=500)
      if (d.daysUntilDue !== null && d.daysUntilDue < 0) return true; // overdue
      if (d.daysUntilDue !== null && d.daysUntilDue <= 14) return true; // due soon
      if (d.amount >= 500 && d.daysUntilDue === null) return true; // large, no due date
      return false;
    });

  const fiveDaysAgo = new Date();
  fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
  const fiveDaysAgoStr = fiveDaysAgo.toISOString().slice(0, 10);

  const { data: txData, error: txError } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .eq("sub_type", "client_money_received")
    .lte("transaction_date", fiveDaysAgoStr);

  if (txError) throw new Error(`Supabase transactions error: ${txError.message}`);

  const clientTxs = (txData ?? []) as Transaction[];
  const clientMap = new Map<string, ClientMoneyAlert>();

  for (const tx of clientTxs) {
    if (!tx.client_id) continue;
    const key = `${tx.client_id}_${tx.currency}`;
    const existing = clientMap.get(key);
    const amount = Number(tx.amount) || 0;

    if (existing) {
      existing.totalReceived += amount;
      existing.balance += amount;
    } else {
      clientMap.set(key, {
        client_id: tx.client_id,
        totalReceived: amount,
        totalSpent: 0,
        balance: amount,
        currency: tx.currency,
        daysOld: daysSince(tx.transaction_date),
      });
    }
  }

  const { data: spentData } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .in("sub_type", ["client_product_purchase", "client_shipping_fee", "client_refund"]);

  for (const tx of (spentData ?? []) as Transaction[]) {
    if (!tx.client_id) continue;
    const key = `${tx.client_id}_${tx.currency}`;
    const existing = clientMap.get(key);
    if (existing) {
      existing.totalSpent += Number(tx.amount) || 0;
      existing.balance -= Number(tx.amount) || 0;
    }
  }

  const clientAlerts = Array.from(clientMap.values()).filter((c) => c.balance > 0);
  const urgentPurchases = await getUrgentPurchaseAlerts(userId);
  const hasUrgentPurchases = urgentPurchases.length > 0;
  const hasUrgentIssues = debtAlerts.length > 0 || clientAlerts.length > 0 || hasUrgentPurchases;

  return {
    date: today,
    debts: debtAlerts,
    clientMoney: clientAlerts,
    urgentPurchases,
    hasUrgentIssues,
    hasUrgentPurchases,
    message: hasUrgentIssues
      ? "Problemes detectes. Action requise."
      : "Aucune alerte critique aujourd'hui.",
  };
}
