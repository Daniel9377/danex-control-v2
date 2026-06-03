"use client";

import { useCallback, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { TransactionSubType, AccountingType } from "@/lib/supabase/types";
import { SUB_TYPE_ACCOUNTING } from "@/lib/transaction-types";
import { cacheInvalidatePrefix } from "@/lib/cache";

export type MigrationStatus =
  | "pending_review"
  | "reviewed"
  | "archived"
  | "ignored_modern_reports";

export interface ReclassifyInput {
  transactionId: string;
  subType: TransactionSubType;
  clientId?: string | null;
  orderId?: string | null;
  note?: string;
}

export interface BulkReclassifyInput {
  transactionIds: string[];
  subType: TransactionSubType;
  note?: string;
}

export interface ReclassifyImpact {
  becomesRealIncome: boolean;
  becomesRealExpense: boolean;
  touchesClientMoney: boolean;
  touchesDebtReceivable: boolean;
  accountingType: AccountingType;
  physicalBalanceChanges: boolean;
}

const REAL_INCOME_TYPES: TransactionSubType[] = [
  "personal_income",
  "business_income",
  "profit_validated",
];

const REAL_EXPENSE_TYPES: TransactionSubType[] = [
  "personal_expense",
  "business_expense",
];

const CLIENT_MONEY_TYPES: TransactionSubType[] = [
  "client_money_received",
  "client_product_purchase",
  "client_shipping_fee",
  "shared_client_fee",
  "client_refund",
];

const DEBT_RECEIVABLE_TYPES: TransactionSubType[] = [
  "debt_received",
  "debt_repayment",
  "receivable_created",
  "receivable_repaid",
];

export function computeImpact(subType: TransactionSubType): ReclassifyImpact {
  const { accounting_type } = SUB_TYPE_ACCOUNTING[subType];
  return {
    becomesRealIncome: REAL_INCOME_TYPES.includes(subType),
    becomesRealExpense: REAL_EXPENSE_TYPES.includes(subType),
    touchesClientMoney: CLIENT_MONEY_TYPES.includes(subType),
    touchesDebtReceivable: DEBT_RECEIVABLE_TYPES.includes(subType),
    accountingType: accounting_type,
    physicalBalanceChanges: false,
  };
}

export function useReclassify(onSuccess?: () => void) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reclassify = useCallback(
    async (input: ReclassifyInput): Promise<boolean> => {
      setLoading(true);
      setError(null);
      const supabase = createClient();
      const { accounting_type } = SUB_TYPE_ACCOUNTING[input.subType];

      const patch: Record<string, unknown> = {
        sub_type: input.subType,
        accounting_type,
        migration_status: "reviewed",
        legacy_reviewed_at: new Date().toISOString(),
      };
      if (input.note !== undefined) patch.legacy_review_note = input.note;
      if (input.clientId !== undefined) patch.client_id = input.clientId;
      if (input.orderId !== undefined) patch.order_id = input.orderId;

      const { error: err } = await supabase
        .from("transactions")
        .update(patch)
        .eq("id", input.transactionId);

      setLoading(false);
      if (err) {
        setError(err.message);
        return false;
      }
      cacheInvalidatePrefix("transactions");
      onSuccess?.();
      return true;
    },
    [onSuccess]
  );

  const reclassifyBulk = useCallback(
    async (input: BulkReclassifyInput): Promise<boolean> => {
      setLoading(true);
      setError(null);
      const supabase = createClient();
      const { accounting_type } = SUB_TYPE_ACCOUNTING[input.subType];

      const patch: Record<string, unknown> = {
        sub_type: input.subType,
        accounting_type,
        migration_status: "reviewed",
        legacy_reviewed_at: new Date().toISOString(),
      };
      if (input.note) patch.legacy_review_note = input.note;

      const { error: err } = await supabase
        .from("transactions")
        .update(patch)
        .in("id", input.transactionIds);

      setLoading(false);
      if (err) {
        setError(err.message);
        return false;
      }
      cacheInvalidatePrefix("transactions");
      onSuccess?.();
      return true;
    },
    [onSuccess]
  );

  const markIgnored = useCallback(
    async (transactionId: string, note?: string): Promise<boolean> => {
      setLoading(true);
      setError(null);
      const supabase = createClient();

      const patch: Record<string, unknown> = {
        migration_status: "ignored_modern_reports",
        legacy_reviewed_at: new Date().toISOString(),
      };
      if (note) patch.legacy_review_note = note;

      const { error: err } = await supabase
        .from("transactions")
        .update(patch)
        .eq("id", transactionId);

      setLoading(false);
      if (err) { setError(err.message); return false; }
      cacheInvalidatePrefix("transactions");
      onSuccess?.();
      return true;
    },
    [onSuccess]
  );

  const revert = useCallback(
    async (transactionId: string): Promise<boolean> => {
      setLoading(true);
      setError(null);
      const supabase = createClient();

      const { error: err } = await supabase
        .from("transactions")
        .update({
          sub_type: null,
          migration_status: "pending_review",
          legacy_reviewed_at: null,
          legacy_review_note: null,
        })
        .eq("id", transactionId);

      setLoading(false);
      if (err) { setError(err.message); return false; }
      cacheInvalidatePrefix("transactions");
      onSuccess?.();
      return true;
    },
    [onSuccess]
  );

  return { reclassify, reclassifyBulk, markIgnored, revert, loading, error };
}
