"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Debt, DebtDirection, DebtPayment } from "@/lib/supabase/types";

export function useDebts() {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("debts")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setDebts(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function addDebt(
    userId: string,
    personName: string,
    direction: DebtDirection,
    amount: number,
    currency: string,
    dueDate: string | null,
    note: string | null,
    linkedAccountId: string | null
  ) {
    const supabase = createClient();
    await supabase.from("debts").insert({
      user_id: userId,
      person_name: personName,
      direction,
      amount,
      currency,
      due_date: dueDate,
      note,
      linked_account_id: linkedAccountId,
      paid_amount: 0,
      status: "unpaid",
    });
    await load();
  }

  async function addPayment(
    userId: string,
    debt: Debt,
    paymentAmount: number,
    accountId: string | null,
    paymentDate: string,
    note: string | null
  ) {
    const supabase = createClient();
    await supabase.from("debt_payments").insert({
      user_id: userId,
      debt_id: debt.id,
      account_id: accountId,
      amount: paymentAmount,
      payment_date: paymentDate,
      note,
    });

    const newPaid = Number(debt.paid_amount) + paymentAmount;
    const newStatus =
      newPaid >= Number(debt.amount)
        ? "paid"
        : newPaid > 0
        ? "partial"
        : "unpaid";

    await supabase
      .from("debts")
      .update({ paid_amount: newPaid, status: newStatus })
      .eq("id", debt.id);

    // Optionally adjust account balance
    if (accountId) {
      const { data: acc } = await supabase
        .from("accounts")
        .select("balance")
        .eq("id", accountId)
        .single();
      if (acc) {
        const delta =
          debt.direction === "i_owe" ? -paymentAmount : paymentAmount;
        await supabase
          .from("accounts")
          .update({ balance: Number(acc.balance) + delta })
          .eq("id", accountId);
      }
    }

    await load();
  }

  async function deleteDebt(id: string) {
    const supabase = createClient();
    await supabase.from("debts").delete().eq("id", id);
    await load();
  }

  async function getPayments(debtId: string): Promise<DebtPayment[]> {
    const supabase = createClient();
    const { data } = await supabase
      .from("debt_payments")
      .select("*")
      .eq("debt_id", debtId)
      .order("payment_date", { ascending: false });
    return data ?? [];
  }

  return { debts, loading, addDebt, addPayment, deleteDebt, getPayments, reload: load };
}
