"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Debt, DebtDirection, DebtPayment, SettlementMethod } from "@/lib/supabase/types";
import { cacheGet, cacheSet, cacheInvalidate } from "@/lib/cache";

const KEY = "debts";

export function useDebts() {
  const [debts, setDebts] = useState<Debt[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const cached = cacheGet<Debt[]>(KEY);
    if (cached) {
      setDebts(cached);
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const { data } = await supabase
      .from("debts")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) {
      cacheSet(KEY, data);
      setDebts(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Create a debt record.
   *
   * For direction === "owes_me" (I lent money):
   *   - If affectsBalance === true AND linkedAccountId is set, the linked account is
   *     debited immediately (the money physically left that account).
   *   - If affectsBalance === false, only a declaration is created — no account changes.
   *
   * For direction === "i_owe" (someone lent me / holds money for me):
   *   - Creation never changes account balances (the money is already somewhere).
   */
  async function addDebt(
    userId: string,
    personName: string,
    direction: DebtDirection,
    amount: number,
    currency: string,
    dueDate: string | null,
    note: string | null,
    linkedAccountId: string | null,
    affectsBalance: boolean = false
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
      affects_balance: affectsBalance,
    });

    // Debit account only when money actually left (owes_me + affectsBalance)
    if (direction === "owes_me" && affectsBalance && linkedAccountId) {
      const { data: acc } = await supabase
        .from("accounts")
        .select("balance")
        .eq("id", linkedAccountId)
        .single();
      if (acc) {
        await supabase
          .from("accounts")
          .update({ balance: Number(acc.balance) - amount })
          .eq("id", linkedAccountId);
      }
      cacheInvalidate("accounts");
    }

    cacheInvalidate(KEY);
    await load();
  }

  /**
   * Record a payment against a debt.
   *
   * settlement_method controls whether an account balance is touched:
   *   - "real_payment"       — money actually moved; account is debited/credited
   *   - "compensation"       — settled via an existing transaction; NO new account movement
   *   - "linked_transaction" — settled by referencing an existing tx; NO new account movement
   *
   * Guards:
   *   - Cannot pay more than the remaining amount (throws)
   *   - Silently no-ops if debt is already paid
   */
  async function addPayment(
    userId: string,
    debt: Debt,
    paymentAmount: number,
    accountId: string | null,
    paymentDate: string,
    note: string | null,
    settlementMethod: SettlementMethod = "real_payment",
    linkedTransactionId: string | null = null
  ) {
    const supabase = createClient();

    // ── Read the FRESH debt state from the DB to avoid stale React cache ────
    // The `debt` parameter comes from React state which may not have re-rendered
    // after a previous payment in the same tick, causing `paid_amount` to be stale.
    // This would silently overwrite the real paid_amount, corrupt the debt status,
    // and skip the account balance update on subsequent payments.
    const { data: fresh, error: freshError } = await supabase
      .from("debts")
      .select("amount, paid_amount, status, direction")
      .eq("id", debt.id)
      .single();

    if (freshError) throw new Error(`Impossible de vérifier la dette : ${freshError.message}`);
    if (!fresh) throw new Error("Cette dette n'existe plus.");

    if (fresh.status === "paid") {
      throw new Error("Cette dette est déjà entièrement réglée.");
    }

    const currentPaid = Number(fresh.paid_amount);
    const totalAmount = Number(fresh.amount);
    const remaining = totalAmount - currentPaid;

    if (paymentAmount > remaining + 0.001) {
      throw new Error(
        `Le montant (${paymentAmount}) dépasse le solde restant (${remaining.toFixed(2)}).`
      );
    }

    // ── Insert payment record ──────────────────────────────────────────────
    const { error: pmtError } = await supabase.from("debt_payments").insert({
      user_id: userId,
      debt_id: debt.id,
      account_id: accountId,
      amount: paymentAmount,
      payment_date: paymentDate,
      note,
      settlement_method: settlementMethod,
      linked_transaction_id: linkedTransactionId,
    });

    if (pmtError) throw new Error(`Échec de l'enregistrement du paiement : ${pmtError.message}`);

    // ── Update debt status (using the FRESH paid_amount) ────────────────────
    const newPaid = currentPaid + paymentAmount;
    const newStatus =
      newPaid >= totalAmount ? "paid" : newPaid > 0 ? "partial" : "unpaid";

    const { error: debtUpdateError } = await supabase
      .from("debts")
      .update({ paid_amount: newPaid, status: newStatus })
      .eq("id", debt.id);

    if (debtUpdateError) throw new Error(`Échec de la mise à jour de la dette : ${debtUpdateError.message}`);

    // ── Update account balance for real payments ────────────────────────────
    if (accountId && settlementMethod === "real_payment") {
      const { data: acc, error: accError } = await supabase
        .from("accounts")
        .select("balance")
        .eq("id", accountId)
        .single();

      if (accError) throw new Error(`Compte introuvable : ${accError.message}`);
      if (!acc) throw new Error("Compte introuvable (aucune ligne retournée).");

      const delta = fresh.direction === "i_owe" ? -paymentAmount : paymentAmount;
      const newBalance = Number(acc.balance) + delta;

      const { error: accUpdateError } = await supabase
        .from("accounts")
        .update({ balance: newBalance })
        .eq("id", accountId);

      if (accUpdateError) throw new Error(`Échec de la mise à jour du solde : ${accUpdateError.message}`);

      cacheInvalidate("accounts");
    }

    cacheInvalidate(KEY);
    await load();
  }

  /**
   * Delete a debt, reversing all account balance changes caused by:
   *   1. Real payments recorded against this debt
   *   2. The initial account debit (if direction === "owes_me" && affects_balance)
   *
   * Debt records with payments are cascade-deleted in the DB.
   */
  async function deleteDebt(id: string) {
    const supabase = createClient();

    // Fetch the debt before deletion
    const { data: debt } = await supabase
      .from("debts")
      .select("*")
      .eq("id", id)
      .single();

    if (!debt) {
      await supabase.from("debts").delete().eq("id", id);
      cacheInvalidate(KEY);
      await load();
      return;
    }

    // Fetch all payments
    const { data: payments } = await supabase
      .from("debt_payments")
      .select("*")
      .eq("debt_id", id);

    // Reverse each real_payment's account effect
    if (payments) {
      for (const p of payments) {
        if (p.account_id && p.settlement_method === "real_payment") {
          const { data: acc } = await supabase
            .from("accounts")
            .select("balance")
            .eq("id", p.account_id)
            .single();
          if (acc) {
            // Reverse: if i_owe, payment debited account → credit back; if owes_me, credited → debit back
            const reversal = debt.direction === "i_owe" ? p.amount : -p.amount;
            await supabase
              .from("accounts")
              .update({ balance: Number(acc.balance) + reversal })
              .eq("id", p.account_id);
          }
        }
      }
    }

    // Reverse initial debit if owes_me + affects_balance
    if (debt.direction === "owes_me" && debt.affects_balance && debt.linked_account_id) {
      const { data: acc } = await supabase
        .from("accounts")
        .select("balance")
        .eq("id", debt.linked_account_id)
        .single();
      if (acc) {
        // We had debited the account when creating the debt → add back
        await supabase
          .from("accounts")
          .update({ balance: Number(acc.balance) + Number(debt.amount) })
          .eq("id", debt.linked_account_id);
      }
    }

    // Delete the debt (cascade deletes payments)
    await supabase.from("debts").delete().eq("id", id);

    cacheInvalidate(KEY);
    cacheInvalidate("accounts");
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
