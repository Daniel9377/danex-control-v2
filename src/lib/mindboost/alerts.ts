import { createAdminClient } from "@/lib/supabase/admin";
import type { Debt, Transaction } from "@/lib/supabase/types";

export type AlertsReport = {
  date: string;
  debts: DebtAlert[];
  clientMoney: ClientMoneyAlert[];
  hasUrgentIssues: boolean;
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
};

type ClientMoneyAlert = {
  client_id: string;
  totalReceived: number;
  totalSpent: number;
  balance: number;
  currency: string;
  daysOld: number;
};

function daysSince(dateStr: string): number {
  const now = new Date();
  const then = new Date(dateStr);
  return Math.floor((now.getTime() - then.getTime()) / (1000 * 60 * 60 * 24));
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
    .map((d) => ({
      id: d.id,
      person_name: d.person_name,
      direction: d.direction,
      amount: d.amount - d.paid_amount,
      currency: d.currency,
      daysOld: daysSince(d.created_at),
      status: d.status,
    }))
    .filter((d) => d.daysOld >= 7 || d.amount >= 500);

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
  const hasUrgentIssues = debtAlerts.length > 0 || clientAlerts.length > 0;

  return {
    date: today,
    debts: debtAlerts,
    clientMoney: clientAlerts,
    hasUrgentIssues,
    message: hasUrgentIssues
      ? "Problemes detectes. Action requise."
      : "Aucune alerte critique aujourd'hui.",
  };
}
