"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useTransactions } from "@/hooks/useTransactions";
import { useAccounts } from "@/hooks/useAccounts";
import { useClients } from "@/hooks/useClients";
import { useOrders } from "@/hooks/useOrders";
import { useDebts } from "@/hooks/useDebts";
import { useCurrencies } from "@/hooks/useCurrencies";
import { SharedFeeAllocation } from "@/lib/supabase/types";
import { computeAllAlerts, SmartAlert } from "@/lib/alert-calculations";
import { cacheGet, cacheSet } from "@/lib/cache";

const ALLOC_KEY = "shared_fee_allocations";

export interface FinancialAlertsResult {
  alerts: SmartAlert[];
  loading: boolean;
  criticalCount: number;
  highCount: number;
}

export function useFinancialAlerts(): FinancialAlertsResult {
  const { transactions, loading: txLoading } = useTransactions();
  const { accounts, loading: accountsLoading } = useAccounts();
  const { clients, loading: clientsLoading } = useClients();
  const { orders, loading: ordersLoading } = useOrders();
  const { debts, loading: debtsLoading } = useDebts();
  const { ratesByCode, loading: currLoading } = useCurrencies();

  const [allocations, setAllocations] = useState<SharedFeeAllocation[]>([]);
  const [allocLoading, setAllocLoading] = useState(true);

  const loadAllocs = useCallback(async () => {
    const cached = cacheGet<SharedFeeAllocation[]>(ALLOC_KEY);
    if (cached) {
      setAllocations(cached);
      setAllocLoading(false);
      return;
    }
    const supabase = createClient();
    const { data } = await supabase.from("shared_fee_allocations").select("*");
    const list = (data as SharedFeeAllocation[]) ?? [];
    cacheSet(ALLOC_KEY, list);
    setAllocations(list);
    setAllocLoading(false);
  }, []);

  useEffect(() => {
    loadAllocs();
  }, [loadAllocs]);

  const loading =
    txLoading || accountsLoading || clientsLoading || ordersLoading ||
    debtsLoading || currLoading || allocLoading;

  const alerts = useMemo(
    () =>
      loading
        ? []
        : computeAllAlerts({
            transactions,
            clients,
            orders,
            debts,
            accounts,
            allocations,
            ratesByCode,
          }),
    [loading, transactions, clients, orders, debts, accounts, allocations, ratesByCode]
  );

  const criticalCount = useMemo(
    () => alerts.filter((a) => a.severity === "critical").length,
    [alerts]
  );
  const highCount = useMemo(
    () => alerts.filter((a) => a.severity === "high").length,
    [alerts]
  );

  return { alerts, loading, criticalCount, highCount };
}
