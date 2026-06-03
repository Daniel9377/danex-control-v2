"use client";

import { useMemo } from "react";
import { useAccounts } from "@/hooks/useAccounts";
import { useTransactions } from "@/hooks/useTransactions";
import { useDebts } from "@/hooks/useDebts";
import { useCurrencies } from "@/hooks/useCurrencies";
import { sumAccountsInCurrency } from "@/lib/currency";
import {
  computeMonthlyMetrics,
  computeClientMoneyOverview,
  computeDebtOverview,
  type MonthlyMetrics,
  type ClientMoneyOverview,
  type DebtOverview,
} from "@/lib/financial-calculations";

export interface FinancialOverview {
  /** Sum of all account balances (physical cash). */
  physicalBalance: { total: number; hasMissing: boolean };
  /** Sum of accounts with availability="immediate". */
  availableBalance: { total: number; hasMissing: boolean };
  /** Sum of accounts with availability="distant"|"blocked". */
  distantBalance: { total: number; hasMissing: boolean };
  /** Estimated personal money: physicalBalance − clientHeld − debtsOwed. */
  personalBalanceEstimate: number;
  clientMoney: ClientMoneyOverview;
  debtOverview: DebtOverview;
  monthlyMetrics: MonthlyMetrics;
  loading: boolean;
  ratesByCode: Record<string, number | string | null>;
}

export function useFinancialOverview(): FinancialOverview {
  const { accounts, loading: accountsLoading } = useAccounts();
  const { transactions, loading: txLoading } = useTransactions();
  const { debts, loading: debtsLoading } = useDebts();
  const { ratesByCode, loading: currLoading } = useCurrencies();

  const loading = accountsLoading || txLoading || debtsLoading || currLoading;

  const physicalBalance = useMemo(
    () => sumAccountsInCurrency(accounts, "USD", ratesByCode),
    [accounts, ratesByCode]
  );

  const availableBalance = useMemo(() => {
    const av = accounts.filter(
      (a) => !a.availability || a.availability === "immediate"
    );
    return sumAccountsInCurrency(av, "USD", ratesByCode);
  }, [accounts, ratesByCode]);

  const distantBalance = useMemo(() => {
    const dist = accounts.filter(
      (a) => a.availability === "distant" || a.availability === "blocked"
    );
    return sumAccountsInCurrency(dist, "USD", ratesByCode);
  }, [accounts, ratesByCode]);

  const clientMoney = useMemo(
    () => computeClientMoneyOverview(transactions, ratesByCode),
    [transactions, ratesByCode]
  );

  const debtOverview = useMemo(
    () => computeDebtOverview(debts, ratesByCode),
    [debts, ratesByCode]
  );

  const monthlyMetrics = useMemo(
    () => computeMonthlyMetrics(transactions, ratesByCode),
    [transactions, ratesByCode]
  );

  const personalBalanceEstimate = useMemo(
    () =>
      physicalBalance.total -
      clientMoney.netHeldUSD -
      debtOverview.totalOwedUSD,
    [physicalBalance.total, clientMoney.netHeldUSD, debtOverview.totalOwedUSD]
  );

  return {
    loading,
    physicalBalance,
    availableBalance,
    distantBalance,
    personalBalanceEstimate,
    clientMoney,
    debtOverview,
    monthlyMetrics,
    ratesByCode,
  };
}
