"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  Transaction,
  TransactionType,
  AccountingType,
  TransactionSubType,
  SharedFeeAllocation,
} from "@/lib/supabase/types";
import { SUB_TYPE_ACCOUNTING } from "@/lib/transaction-types";
import { cacheGet, cacheSet, cacheInvalidate, cacheInvalidatePrefix } from "@/lib/cache";

const PREFIX = "transactions";

// ── Input type for createOperation ───────────────────────────────────────────

export interface CreateOperationInput {
  subType: TransactionSubType;
  /** Required except for profit_validated (no physical balance change). */
  accountId?: string;
  amount: number;
  currency: string;
  category?: string;
  note?: string;
  date: string;
  idempotencyKey: string;
  /** Client link (client_money_received, purchases, fees, refunds, profit). */
  clientId?: string;
  /** Order link. */
  orderId?: string;
  /** For debt_received / receivable_created: the creditor/debtor name. */
  personName?: string;
  personPhone?: string;
  /** Optional due date for new debt/receivable. */
  dueDate?: string;
  /** For debt_repayment: id of the debt to reduce. */
  debtId?: string;
  /** For receivable_repaid: id of the owes_me debt to reduce. */
  receivableId?: string;
  /** For shared_client_fee: list of per-client allocations. */
  allocations?: Array<{ clientId?: string; orderId?: string; amount: number }>;
  /** For balance_correction: the target balance to reach. */
  targetBalance?: number;
}

// ── Main hook ─────────────────────────────────────────────────────────────────

export function useTransactions(accountId?: string) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const key = accountId ? `${PREFIX}:${accountId}` : `${PREFIX}:all`;
    const cached = cacheGet<Transaction[]>(key);
    if (cached) {
      setTransactions(cached);
      setLoading(false);
      return;
    }
    const supabase = createClient();
    let query = supabase
      .from("transactions")
      .select("*")
      .order("transaction_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (accountId) query = query.eq("account_id", accountId);
    const { data } = await query;
    if (data) {
      cacheSet(key, data);
      setTransactions(data);
    }
    setLoading(false);
  }, [accountId]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Legacy addTransaction (backward-compatible) ────────────────────────────

  async function addTransaction(
    userId: string,
    acctId: string,
    type: TransactionType,
    amount: number,
    currency: string,
    category: string | null,
    note: string | null,
    date: string,
    accountingType: AccountingType | null = null
  ) {
    const supabase = createClient();

    const { data: acc } = await supabase
      .from("accounts")
      .select("balance")
      .eq("id", acctId)
      .single();

    const currentBalance = acc ? Number(acc.balance) : 0;
    const delta = type === "income" ? amount : -amount;
    const balanceAfter = currentBalance + delta;

    await supabase.from("transactions").insert({
      user_id: userId,
      account_id: acctId,
      type,
      amount,
      currency,
      category,
      note,
      transaction_date: date,
      accounting_type: accountingType,
      balance_after: balanceAfter,
    });

    await supabase.from("accounts").update({ balance: balanceAfter }).eq("id", acctId);

    cacheInvalidatePrefix(PREFIX);
    cacheInvalidate("accounts");
    await load();
  }

  // ── New: createOperation — full sub-type aware operation ──────────────────

  async function createOperation(userId: string, input: CreateOperationInput): Promise<void> {
    const supabase = createClient();

    const { subType, amount, currency, date, idempotencyKey } = input;
    const { type: txType, accounting_type } = SUB_TYPE_ACCOUNTING[subType];

    // ── Idempotency check ────────────────────────────────────────────────────
    if (idempotencyKey) {
      const { data: dup } = await supabase
        .from("transactions")
        .select("id")
        .eq("user_id", userId)
        .eq("idempotency_key", idempotencyKey)
        .maybeSingle();
      if (dup) return; // already created
    }

    // ── Balance correction (special case) ────────────────────────────────────
    if (subType === "balance_correction") {
      await _handleBalanceCorrection(supabase, userId, input);
      cacheInvalidatePrefix(PREFIX);
      cacheInvalidate("accounts");
      await load();
      return;
    }

    // ── Profit validated (no balance change) ─────────────────────────────────
    if (subType === "profit_validated") {
      await _handleProfitValidated(supabase, userId, input, txType, accounting_type);
      cacheInvalidatePrefix(PREFIX);
      cacheInvalidate("accounts");
      cacheInvalidate("all_client_financials");
      await load();
      return;
    }

    // ── Standard operation with account balance change ────────────────────────
    const acctId = input.accountId!;
    const { data: acc } = await supabase
      .from("accounts")
      .select("balance")
      .eq("id", acctId)
      .single();

    const currentBalance = acc ? Number(acc.balance) : 0;
    const delta = txType === "income" ? amount : -amount;
    const balanceAfter = currentBalance + delta;

    // Resolve category label for simple types
    const category =
      input.category ||
      _defaultCategory(subType, input.personName) ||
      null;

    const { data: txData, error: txError } = await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        account_id: acctId,
        type: txType,
        amount,
        currency,
        category,
        note: input.note || null,
        transaction_date: date,
        accounting_type,
        balance_after: balanceAfter,
        sub_type: subType,
        client_id: input.clientId || null,
        order_id: input.orderId || null,
        idempotency_key: idempotencyKey,
      })
      .select("id")
      .single();

    if (txError) {
      if (txError.code === "23505") return; // duplicate idempotency key — already done
      throw new Error(txError.message);
    }

    const txId = txData?.id;

    // Update account balance
    await supabase.from("accounts").update({ balance: balanceAfter }).eq("id", acctId);

    // ── Side effects based on sub-type ────────────────────────────────────────

    if (subType === "debt_received" && input.personName && txId) {
      await _createDebtRecord(supabase, userId, {
        personName: input.personName,
        personPhone: input.personPhone,
        direction: "i_owe",
        amount,
        currency,
        dueDate: input.dueDate || null,
        note: input.note || null,
        linkedAccountId: acctId,
        affectsBalance: false,
        creationTxId: txId,
      });
    }

    if (subType === "receivable_created" && input.personName && txId) {
      await _createDebtRecord(supabase, userId, {
        personName: input.personName,
        personPhone: input.personPhone,
        direction: "owes_me",
        amount,
        currency,
        dueDate: input.dueDate || null,
        note: input.note || null,
        linkedAccountId: acctId,
        affectsBalance: false,
        creationTxId: txId,
      });
    }

    if (subType === "debt_repayment" && input.debtId) {
      await _recordDebtPayment(supabase, userId, {
        debtId: input.debtId,
        accountId: acctId,
        amount,
        date,
        note: input.note || null,
        linkedTxId: txId || null,
      });
    }

    if (subType === "receivable_repaid" && input.receivableId) {
      await _recordDebtPayment(supabase, userId, {
        debtId: input.receivableId,
        accountId: acctId,
        amount,
        date,
        note: input.note || null,
        linkedTxId: txId || null,
      });
    }

    if (subType === "shared_client_fee" && input.allocations?.length && txId) {
      const allocs = input.allocations.map((a) => ({
        user_id: userId,
        transaction_id: txId,
        client_id: a.clientId || null,
        order_id: a.orderId || null,
        allocated_amount: a.amount,
        currency,
        allocation_method: "manual" as const,
      }));
      await supabase.from("shared_fee_allocations").insert(allocs);
    }

    cacheInvalidatePrefix(PREFIX);
    cacheInvalidate("accounts");
    cacheInvalidate("debts");
    cacheInvalidate("shared_fee_allocations");
    cacheInvalidate("all_client_financials");
    await load();
  }

  // ── Delete transaction (reverses balance) ─────────────────────────────────

  async function deleteTransaction(
    id: string,
    acctId: string | null,
    type: TransactionType,
    amount: number
  ) {
    const supabase = createClient();
    await supabase.from("transactions").delete().eq("id", id);

    if (acctId) {
      const { data: acc } = await supabase
        .from("accounts")
        .select("balance")
        .eq("id", acctId)
        .single();

      if (acc) {
        const reversal = type === "income" ? -amount : amount;
        await supabase
          .from("accounts")
          .update({ balance: Number(acc.balance) + reversal })
          .eq("id", acctId);
      }
    }

    cacheInvalidatePrefix(PREFIX);
    cacheInvalidate("accounts");
    cacheInvalidate("all_client_financials");
    await load();
  }

  // ── Balance reconciliation (legacy, kept for compat) ──────────────────────

  async function addAdjustment(
    userId: string,
    acctId: string,
    currency: string,
    targetBalance: number,
    note: string | null,
    date: string
  ) {
    const supabase = createClient();

    const { data: acc, error: accError } = await supabase
      .from("accounts")
      .select("balance")
      .eq("id", acctId)
      .single();

    if (accError) throw new Error(`Compte introuvable : ${accError.message}`);
    if (!acc) throw new Error("Compte introuvable.");

    const currentBalance = Number(acc.balance);
    const difference = targetBalance - currentBalance;
    if (Math.abs(difference) < 0.001) return;

    const type: TransactionType = difference > 0 ? "income" : "expense";
    const amount = Math.abs(difference);

    const { error: insertError } = await supabase.from("transactions").insert({
      user_id: userId,
      account_id: acctId,
      type,
      amount,
      currency,
      category: "Correction de solde",
      note: note || "Ajustement de solde",
      transaction_date: date,
      accounting_type: "adjustment",
      balance_after: targetBalance,
      sub_type: "balance_correction",
    });

    if (insertError) throw new Error(`Échec de la correction : ${insertError.message}`);

    const { error: updateError } = await supabase
      .from("accounts")
      .update({ balance: targetBalance })
      .eq("id", acctId);

    if (updateError) throw new Error(`Échec de la mise à jour du solde : ${updateError.message}`);

    cacheInvalidatePrefix(PREFIX);
    cacheInvalidate("accounts");
    await load();
  }

  return {
    transactions,
    loading,
    addTransaction,
    createOperation,
    deleteTransaction,
    addAdjustment,
    reload: load,
  };
}

// ── Private helpers ───────────────────────────────────────────────────────────

async function _handleBalanceCorrection(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  input: CreateOperationInput
) {
  const { accountId, targetBalance, currency, date, note, idempotencyKey } = input;
  if (!accountId || targetBalance === undefined) return;

  const { data: acc } = await supabase
    .from("accounts")
    .select("balance")
    .eq("id", accountId)
    .single();
  if (!acc) return;

  const currentBalance = Number(acc.balance);
  const difference = targetBalance - currentBalance;
  if (Math.abs(difference) < 0.001) return;

  const type: TransactionType = difference > 0 ? "income" : "expense";
  const amount = Math.abs(difference);

  const { error } = await supabase.from("transactions").insert({
    user_id: userId,
    account_id: accountId,
    type,
    amount,
    currency,
    category: "Correction de solde",
    note: note || "Correction de solde",
    transaction_date: date,
    accounting_type: "adjustment",
    balance_after: targetBalance,
    sub_type: "balance_correction",
    idempotency_key: idempotencyKey,
  });

  if (error && error.code !== "23505") throw new Error(error.message);

  await supabase.from("accounts").update({ balance: targetBalance }).eq("id", accountId);
}

async function _handleProfitValidated(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  input: CreateOperationInput,
  txType: TransactionType,
  accounting_type: AccountingType
) {
  const { amount, currency, date, note, idempotencyKey, clientId, orderId } = input;

  const { data: txData, error } = await supabase
    .from("transactions")
    .insert({
      user_id: userId,
      account_id: null,
      affects_physical_balance: false,
      type: txType,
      amount,
      currency,
      category: "Bénéfice validé",
      note: note || null,
      transaction_date: date,
      accounting_type,
      sub_type: "profit_validated",
      client_id: clientId || null,
      order_id: orderId || null,
      idempotency_key: idempotencyKey,
      balance_after: null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return;
    throw new Error(error.message);
  }

  if (orderId) {
    const { data: order } = await supabase
      .from("orders")
      .select("real_profit_amount")
      .eq("id", orderId)
      .single();

    const currentProfit = order ? Number(order.real_profit_amount ?? 0) : 0;
    await supabase
      .from("orders")
      .update({
        real_profit_amount: currentProfit + amount,
        real_profit_currency: currency,
        profit_validated_at: new Date().toISOString(),
      })
      .eq("id", orderId);
  }
}

async function _createDebtRecord(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  opts: {
    personName: string;
    personPhone?: string;
    direction: "i_owe" | "owes_me";
    amount: number;
    currency: string;
    dueDate: string | null;
    note: string | null;
    linkedAccountId: string;
    affectsBalance: boolean;
    creationTxId: string;
  }
) {
  await supabase.from("debts").insert({
    user_id: userId,
    person_name: opts.personName,
    direction: opts.direction,
    amount: opts.amount,
    currency: opts.currency,
    due_date: opts.dueDate,
    note: opts.note,
    linked_account_id: opts.linkedAccountId,
    paid_amount: 0,
    status: "unpaid",
    affects_balance: opts.affectsBalance,
    creation_tx_id: opts.creationTxId,
  });
}

async function _recordDebtPayment(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  opts: {
    debtId: string;
    accountId: string;
    amount: number;
    date: string;
    note: string | null;
    linkedTxId: string | null;
  }
) {
  const { data: debt } = await supabase
    .from("debts")
    .select("amount, paid_amount")
    .eq("id", opts.debtId)
    .single();

  if (!debt) return;

  await supabase.from("debt_payments").insert({
    user_id: userId,
    debt_id: opts.debtId,
    account_id: opts.accountId,
    amount: opts.amount,
    payment_date: opts.date,
    note: opts.note,
    settlement_method: "real_payment",
    linked_transaction_id: opts.linkedTxId,
  });

  const newPaid = Number(debt.paid_amount) + opts.amount;
  const newStatus =
    newPaid >= Number(debt.amount) ? "paid" : newPaid > 0 ? "partial" : "unpaid";

  await supabase
    .from("debts")
    .update({ paid_amount: newPaid, status: newStatus })
    .eq("id", opts.debtId);
}

function _defaultCategory(subType: TransactionSubType, personName?: string): string | null {
  const labels: Partial<Record<TransactionSubType, string>> = {
    client_money_received:   "Argent client reçu",
    client_product_purchase: "Achat produit client",
    client_shipping_fee:     "Frais client",
    shared_client_fee:       "Frais partagé clients",
    client_refund:           "Remboursement client",
    profit_validated:        "Bénéfice validé",
    debt_received:           personName ? `Dette — ${personName}` : "Dette reçue",
    debt_repayment:          "Remboursement de dette",
    receivable_created:      personName ? `Créance — ${personName}` : "Créance créée",
    receivable_repaid:       "Créance remboursée",
    transfer_in:             "Transfert reçu",
    transfer_out:            "Transfert envoyé",
  };
  return labels[subType] ?? null;
}

// ── Standalone query helpers (not tied to hook) ───────────────────────────────

/** Fetch all transactions linked to a specific client. */
export async function fetchClientTransactions(clientId: string): Promise<Transaction[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("transactions")
    .select("*")
    .eq("client_id", clientId)
    .order("transaction_date", { ascending: false });
  return (data as Transaction[]) ?? [];
}

/** Fetch all shared fee allocations for a client. */
export async function fetchClientAllocations(clientId: string): Promise<SharedFeeAllocation[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("shared_fee_allocations")
    .select("*")
    .eq("client_id", clientId);
  return (data as SharedFeeAllocation[]) ?? [];
}
