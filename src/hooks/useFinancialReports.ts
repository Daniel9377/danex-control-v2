"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTransactions } from "@/hooks/useTransactions";
import { useClients } from "@/hooks/useClients";
import { useOrders } from "@/hooks/useOrders";
import { useDebts } from "@/hooks/useDebts";
import { useAccounts } from "@/hooks/useAccounts";
import { useCurrencies } from "@/hooks/useCurrencies";
import type {
  Transaction, Client, Order, Debt, Account, SharedFeeAllocation,
} from "@/lib/supabase/types";

export interface FinancialReportsData {
  loading: boolean;
  transactions: Transaction[];
  clients: Client[];
  orders: Order[];
  debts: Debt[];
  accounts: Account[];
  allocations: SharedFeeAllocation[];
  ratesByCode: Record<string, number | string | null>;
}

/**
 * Loads all data required by the Reports page.
 * Computation is intentionally left to the page via useMemo,
 * so period filters and display options stay in UI state.
 */
export function useFinancialReports(): FinancialReportsData {
  const { transactions, loading: txLoading } = useTransactions();
  const { clients, loading: clientsLoading } = useClients();
  const { orders, loading: ordersLoading } = useOrders();
  const { debts, loading: debtsLoading } = useDebts();
  const { accounts, loading: accountsLoading } = useAccounts();
  const { ratesByCode, loading: currLoading } = useCurrencies();

  const [allocations, setAllocations] = useState<SharedFeeAllocation[]>([]);
  const [allocLoading, setAllocLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from("shared_fee_allocations")
      .select("*")
      .then(({ data }: { data: unknown }) => {
        setAllocations((data as SharedFeeAllocation[]) ?? []);
        setAllocLoading(false);
      });
  }, []);

  return {
    loading:
      txLoading || clientsLoading || ordersLoading ||
      debtsLoading || accountsLoading || currLoading || allocLoading,
    transactions,
    clients,
    orders,
    debts,
    accounts,
    allocations,
    ratesByCode,
  };
}
