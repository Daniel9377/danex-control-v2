import { createAdminClient } from "@/lib/supabase/admin";
import type { Transaction } from "@/lib/supabase/types";

type CategorySummary = {
  category: string;
  currency: string;
  amount: number;
};

export type MindboostTodaySummary = {
  date: string;
  appCompleted: boolean;
  transactionCount: number;
  realExpenseCount: number;
  totalsByCurrency: Record<string, number>;
  categories: CategorySummary[];
  warnings: string[];
  message: string;
};

function getTodayISODate() {
  return new Date().toISOString().slice(0, 10);
}

function isValidISODate(date: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

function isRealExpense(tx: Transaction) {
  if (tx.sub_type === "personal_expense") return true;
  if (tx.sub_type === "business_expense") return true;

  // Legacy fallback only.
  if (!tx.sub_type && tx.accounting_type === "real_expense") return true;

  return false;
}

export async function getMindboostTodaySummary(
  date: string = getTodayISODate()
): Promise<MindboostTodaySummary> {
  if (!isValidISODate(date)) {
    throw new Error("Invalid date format. Expected YYYY-MM-DD.");
  }

  const userId = process.env.MINDBOOST_USER_ID;

  if (!userId) {
    throw new Error("Missing env var: MINDBOOST_USER_ID");
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("user_id", userId)
    .eq("transaction_date", date)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Supabase error while reading transactions: ${error.message}`);
  }

  const transactions = (data ?? []) as Transaction[];
  const realExpenses = transactions.filter(isRealExpense);

  const totalsByCurrency: Record<string, number> = {};
  const categoryMap = new Map<string, CategorySummary>();

  for (const tx of realExpenses) {
    const currency = tx.currency || "UNKNOWN";
    const category = tx.category || "Autre";
    const amount = Number(tx.amount) || 0;

    totalsByCurrency[currency] = (totalsByCurrency[currency] ?? 0) + amount;

    const key = `${category}__${currency}`;
    const existing = categoryMap.get(key);

    if (existing) {
      existing.amount += amount;
    } else {
      categoryMap.set(key, { category, currency, amount });
    }
  }

  const categories = Array.from(categoryMap.values()).sort((a, b) => {
    if (a.currency !== b.currency) return a.currency.localeCompare(b.currency);
    return b.amount - a.amount;
  });

  const appCompleted = transactions.length > 0;

  const warnings: string[] = [];

  if (!appCompleted) {
    warnings.push("Aucune transaction trouvée pour cette date.");
  }

  return {
    date,
    appCompleted,
    transactionCount: transactions.length,
    realExpenseCount: realExpenses.length,
    totalsByCurrency,
    categories,
    warnings,
    message: appCompleted
      ? "App complétée aujourd’hui."
      : "App non complétée pour cette date.",
  };
}
