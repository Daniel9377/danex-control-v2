import { createAdminClient } from "@/lib/supabase/admin";

export async function saveReport(
  userId: string,
  type: "daily" | "weekly" | "monthly",
  date: string,
  content: string,
  metadata?: {
    transaction_count?: number;
    real_expense_count?: number;
    total_expenses?: Record<string, number>;
    urgent_purchases_count?: number;
    active_debts_count?: number;
  }
): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from("mindboost_reports").insert({
    user_id: userId,
    report_type: type,
    report_date: date,
    content,
    transaction_count: metadata?.transaction_count ?? null,
    real_expense_count: metadata?.real_expense_count ?? null,
    total_expenses: metadata?.total_expenses ?? null,
    urgent_purchases_count: metadata?.urgent_purchases_count ?? null,
    active_debts_count: metadata?.active_debts_count ?? null,
  });
}
