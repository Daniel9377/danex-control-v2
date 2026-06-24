/**
 * financial-calculations.ts
 *
 * Pure functions for classifying and aggregating transactions.
 * Used by dashboard, reports, and future export features.
 *
 * Classification priority:
 *   1. sub_type field (Session 5+) — most reliable
 *   2. accounting_type field (Session 4) — legacy but structured
 *   3. tx.type ("income"/"expense") — oldest, ambiguous; treated as "legacy"
 *
 * Legacy transactions (no sub_type) are never silently counted as real
 * income or expense — they must be explicitly classified via accounting_type.
 */

import type { Transaction, Debt, SharedFeeAllocation, Order, TransactionSubType } from "@/lib/supabase/types";
import { getValidRate, DEFAULT_CURRENCIES } from "@/lib/currency";

const DEFAULT_RATE_MAP: Record<string, number> = Object.fromEntries(
  DEFAULT_CURRENCIES.map((c) => [c.code, c.rate_to_usd])
);

// ── Currency conversion ──────────────────────────────────────────────────────

export function toUSD(
  amount: number,
  currency: string,
  ratesByCode: Record<string, number | string | null>
): number {
  if (currency === "USD") return amount;
  const rate = getValidRate(ratesByCode[currency]) ?? DEFAULT_RATE_MAP[currency] ?? 1;
  const usdRate = getValidRate(ratesByCode["USD"]) ?? 1;
  return (amount * rate) / usdRate;
}

// ── Sub-type sets ────────────────────────────────────────────────────────────

const REAL_INCOME_TYPES = new Set<TransactionSubType>([
  "personal_income",
  "business_income",
  "profit_validated",
]);

const REAL_EXPENSE_TYPES = new Set<TransactionSubType>([
  "personal_expense",
  "business_expense",
]);

const CLIENT_COST_TYPES = new Set<TransactionSubType>([
  "client_product_purchase",
  "client_shipping_fee",
  "shared_client_fee",
]);

// ── Transaction classifiers ──────────────────────────────────────────────────

/** Real revenue — personal income, business income, or validated profit.
 *  Falls back to accounting_type="real_income" for legacy transactions. */
export function isRealIncome(tx: Transaction): boolean {
  if (tx.sub_type) return REAL_INCOME_TYPES.has(tx.sub_type);
  return tx.accounting_type === "real_income";
}

/** Real expense — personal or business spending.
 *  Does NOT include client costs, debt repayments, or balance corrections.
 *  Falls back to accounting_type="real_expense" for legacy transactions. */
export function isRealExpense(tx: Transaction): boolean {
  if (tx.sub_type) return REAL_EXPENSE_TYPES.has(tx.sub_type);
  return tx.accounting_type === "real_expense";
}

/** Money received from a client — not revenue, belongs to client. */
export function isClientMoneyIn(tx: Transaction): boolean {
  return tx.sub_type === "client_money_received";
}

/** Costs incurred for a client (product purchase, shipping, shared fees). */
export function isClientCost(tx: Transaction): boolean {
  return tx.sub_type != null && CLIENT_COST_TYPES.has(tx.sub_type);
}

/** Refund issued back to a client. */
export function isClientRefund(tx: Transaction): boolean {
  return tx.sub_type === "client_refund";
}

/** Accounting-only entry: profit extraction, no physical cash movement. */
export function isProfitValidated(tx: Transaction): boolean {
  return tx.sub_type === "profit_validated";
}

/** Transaction was created with the old form — no sub_type classification. */
export function isLegacy(tx: Transaction): boolean {
  return tx.sub_type === null;
}

// ── Date helpers ─────────────────────────────────────────────────────────────

export function isCurrentMonth(dateStr: string): boolean {
  const now = new Date();
  const d = new Date(dateStr);
  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
}

export function daysOverdue(dueDateStr: string | null): number {
  if (!dueDateStr) return 0;
  const due = new Date(dueDateStr);
  const now = new Date();
  if (due >= now) return 0;
  return Math.floor((now.getTime() - due.getTime()) / 86_400_000);
}

// ── Monthly metrics ──────────────────────────────────────────────────────────

export interface MonthlyMetrics {
  /** personal_income + business_income + profit_validated */
  realIncomeUSD: number;
  /** personal_expense + business_expense only */
  realExpenseUSD: number;
  /** profit_validated only (subset of realIncomeUSD) */
  profitValidatedUSD: number;
  /** client_money_received only */
  clientReceivedUSD: number;
  /** client_product_purchase + client_shipping_fee + shared_client_fee */
  clientCostsUSD: number;
  /** client_refund */
  clientRefundsUSD: number;
  /** count of legacy transactions this month (for the alert badge) */
  legacyCount: number;
}

export function computeMonthlyMetrics(
  transactions: Transaction[],
  ratesByCode: Record<string, number | string | null>
): MonthlyMetrics {
  const m: MonthlyMetrics = {
    realIncomeUSD: 0,
    realExpenseUSD: 0,
    profitValidatedUSD: 0,
    clientReceivedUSD: 0,
    clientCostsUSD: 0,
    clientRefundsUSD: 0,
    legacyCount: 0,
  };

  for (const tx of transactions) {
    if (!isCurrentMonth(tx.transaction_date)) continue;
    const usd = toUSD(Number(tx.amount), tx.currency, ratesByCode);

    if (isRealIncome(tx)) m.realIncomeUSD += usd;
    if (isRealExpense(tx)) m.realExpenseUSD += usd;
    if (isProfitValidated(tx)) m.profitValidatedUSD += usd;
    if (isClientMoneyIn(tx)) m.clientReceivedUSD += usd;
    if (isClientCost(tx)) m.clientCostsUSD += usd;
    if (isClientRefund(tx)) m.clientRefundsUSD += usd;
    if (isLegacy(tx)) m.legacyCount++;
  }

  return m;
}

// ── Client money overview (all time) ─────────────────────────────────────────

export interface ClientMoneyOverview {
  /** Total money received from all clients (all time). */
  totalReceivedUSD: number;
  /** Total costs spent for clients (all time). */
  totalCostsUSD: number;
  /** Total refunds issued to clients (all time). */
  totalRefundsUSD: number;
  /** Total profit extracted from client money (all time). */
  totalProfitValidatedUSD: number;
  /** Money currently held for clients: received − costs − refunds − validatedProfit. */
  netHeldUSD: number;
}

export function computeClientMoneyOverview(
  transactions: Transaction[],
  ratesByCode: Record<string, number | string | null>
): ClientMoneyOverview {
  let totalReceivedUSD = 0;
  let totalCostsUSD = 0;
  let totalRefundsUSD = 0;
  let totalProfitValidatedUSD = 0;

  for (const tx of transactions) {
    const usd = toUSD(Number(tx.amount), tx.currency, ratesByCode);
    if (isClientMoneyIn(tx)) totalReceivedUSD += usd;
    if (isClientCost(tx)) totalCostsUSD += usd;
    if (isClientRefund(tx)) totalRefundsUSD += usd;
    if (isProfitValidated(tx)) totalProfitValidatedUSD += usd;
  }

  return {
    totalReceivedUSD,
    totalCostsUSD,
    totalRefundsUSD,
    totalProfitValidatedUSD,
    netHeldUSD: totalReceivedUSD - totalCostsUSD - totalRefundsUSD - totalProfitValidatedUSD,
  };
}

/**
 * Per-account breakdown of client money held — same logic as
 * computeClientMoneyOverview, scoped to a single account_id.
 *
 * "Bloqué sur ce compte" = reçu des clients − coûts engagés − remboursements.
 * profit_validated has no account_id (accounting-only), so it is excluded here.
 * The sum of blockedAmount across all accounts equals
 * totalReceivedUSD − totalCostsUSD − totalRefundsUSD from the global overview.
 */
export function computeAccountClientMoney(
  transactions: Transaction[],
  accountId: string,
  ratesByCode: Record<string, number | string | null>
): { received: number; costs: number; refunds: number; blocked: number } {
  let received = 0;
  let costs = 0;
  let refunds = 0;

  for (const tx of transactions) {
    if (tx.account_id !== accountId) continue;
    const usd = toUSD(Number(tx.amount), tx.currency, ratesByCode);
    if (isClientMoneyIn(tx)) received += usd;
    if (isClientCost(tx)) costs += usd;
    if (isClientRefund(tx)) refunds += usd;
  }

  return { received, costs, refunds, blocked: received - costs - refunds };
}

// ── Debt / receivable overview ────────────────────────────────────────────────

export interface DebtOverview {
  /** Total amount still owed by me (direction="i_owe", not paid). */
  totalOwedUSD: number;
  /** Total amount receivable from others (direction="owes_me", not paid). */
  totalReceivableUSD: number;
  overdueDebts: Debt[];
  overdueReceivables: Debt[];
}

export function computeDebtOverview(
  debts: Debt[],
  ratesByCode: Record<string, number | string | null>
): DebtOverview {
  const now = new Date();
  let totalOwedUSD = 0;
  let totalReceivableUSD = 0;
  const overdueDebts: Debt[] = [];
  const overdueReceivables: Debt[] = [];

  for (const d of debts) {
    if (d.status === "paid") continue;
    const remaining = Number(d.amount) - Number(d.paid_amount);
    const usd = toUSD(remaining, d.currency, ratesByCode);
    const isOverdue = d.due_date ? new Date(d.due_date) < now : false;

    if (d.direction === "i_owe") {
      totalOwedUSD += usd;
      if (isOverdue) overdueDebts.push(d);
    } else {
      totalReceivableUSD += usd;
      if (isOverdue) overdueReceivables.push(d);
    }
  }

  return { totalOwedUSD, totalReceivableUSD, overdueDebts, overdueReceivables };
}

// ── Chart data builders ───────────────────────────────────────────────────────

export type ChartPeriod = "week" | "month" | "6weeks" | "3months" | "6months" | "year";

export interface ChartDataPoint {
  month: string;
  income: number;
  expenses: number;
}

/**
 * Build bar chart data using ONLY real income/expense transactions.
 * Client money, debt repayments, and corrections are excluded.
 */
export function buildRealMoneyChart(
  transactions: Transaction[],
  ratesByCode: Record<string, number | string | null>,
  period: ChartPeriod
): ChartDataPoint[] {
  const now = new Date();
  const buckets: Record<string, { income: number; expenses: number }> = {};

  if (period === "week") {
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
      buckets[d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" })] = {
        income: 0,
        expenses: 0,
      };
    }
    for (const tx of transactions) {
      if (!isRealIncome(tx) && !isRealExpense(tx)) continue;
      const d = new Date(tx.transaction_date);
      if (now.getTime() - d.getTime() > 7 * 86_400_000) continue;
      const key = d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" });
      if (!buckets[key]) continue;
      const usd = toUSD(Number(tx.amount), tx.currency, ratesByCode);
      if (isRealIncome(tx)) buckets[key].income += usd;
      else buckets[key].expenses += usd;
    }
  } else if (period === "month") {
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(year, month, i);
      buckets[d.toLocaleDateString("fr-FR", { day: "numeric" })] = { income: 0, expenses: 0 };
    }
    for (const tx of transactions) {
      if (!isRealIncome(tx) && !isRealExpense(tx)) continue;
      const d = new Date(tx.transaction_date);
      if (d.getFullYear() !== year || d.getMonth() !== month) continue;
      const key = d.toLocaleDateString("fr-FR", { day: "numeric" });
      if (!buckets[key]) continue;
      const usd = toUSD(Number(tx.amount), tx.currency, ratesByCode);
      if (isRealIncome(tx)) buckets[key].income += usd;
      else buckets[key].expenses += usd;
    }
  } else {
    const monthCount =
      period === "3months" ? 3 : period === "6months" ? 6 : period === "year" ? 12 : 3;
    for (let i = monthCount - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets[d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" })] = {
        income: 0,
        expenses: 0,
      };
    }
    for (const tx of transactions) {
      if (!isRealIncome(tx) && !isRealExpense(tx)) continue;
      const d = new Date(tx.transaction_date);
      const key = d.toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
      if (!buckets[key]) continue;
      const usd = toUSD(Number(tx.amount), tx.currency, ratesByCode);
      if (isRealIncome(tx)) buckets[key].income += usd;
      else buckets[key].expenses += usd;
    }
  }

  return Object.entries(buckets).map(([month, v]) => ({ month, ...v }));
}

/**
 * Build pie chart categories using ONLY real expense transactions.
 * Client costs, debt payments, and corrections are excluded.
 * Pre-filter transactions to the desired period before calling.
 */
export function buildRealExpenseCategories(
  transactions: Transaction[],
  ratesByCode: Record<string, number | string | null>
): { name: string; value: number }[] {
  const cats: Record<string, number> = {};
  for (const tx of transactions) {
    if (!isRealExpense(tx)) continue;
    const cat = tx.category ?? "Divers";
    cats[cat] = (cats[cat] ?? 0) + toUSD(Number(tx.amount), tx.currency, ratesByCode);
  }
  return Object.entries(cats).map(([name, value]) => ({ name, value }));
}

// ── Report-level aggregators (used by Reports page) ───────────────────────────

export interface RealResult {
  personalIncomeUSD: number;
  businessIncomeUSD: number;
  profitValidatedUSD: number;
  totalRealIncomeUSD: number;
  personalExpenseUSD: number;
  businessExpenseUSD: number;
  totalRealExpenseUSD: number;
  netResultUSD: number;
  /** Amount contributed by legacy transactions classified via accounting_type. */
  legacyIncludedUSD: number;
}

/**
 * Compute real income and expense, excluding:
 * - client_money_received, debt_received, receivable_repaid
 * - balance_correction
 * - any other non-income / non-expense sub-types
 *
 * Legacy transactions (no sub_type) fall back to accounting_type.
 */
export function computeRealResult(
  transactions: Transaction[],
  ratesByCode: Record<string, number | string | null>
): RealResult {
  let personalIncomeUSD = 0, businessIncomeUSD = 0, profitValidatedUSD = 0;
  let personalExpenseUSD = 0, businessExpenseUSD = 0, legacyIncludedUSD = 0;

  for (const tx of transactions) {
    const usd = toUSD(Number(tx.amount), tx.currency, ratesByCode);

    if (tx.sub_type === "personal_income") personalIncomeUSD += usd;
    else if (tx.sub_type === "business_income") businessIncomeUSD += usd;
    else if (tx.sub_type === "profit_validated") profitValidatedUSD += usd;
    else if (tx.sub_type === "personal_expense") personalExpenseUSD += usd;
    else if (tx.sub_type === "business_expense") businessExpenseUSD += usd;
    else if (tx.sub_type === null) {
      if (tx.accounting_type === "real_income") {
        personalIncomeUSD += usd;
        legacyIncludedUSD += usd;
      } else if (tx.accounting_type === "real_expense") {
        personalExpenseUSD += usd;
        legacyIncludedUSD += usd;
      }
    }
  }

  const totalRealIncomeUSD = personalIncomeUSD + businessIncomeUSD + profitValidatedUSD;
  const totalRealExpenseUSD = personalExpenseUSD + businessExpenseUSD;

  return {
    personalIncomeUSD, businessIncomeUSD, profitValidatedUSD, totalRealIncomeUSD,
    personalExpenseUSD, businessExpenseUSD, totalRealExpenseUSD,
    netResultUSD: totalRealIncomeUSD - totalRealExpenseUSD,
    legacyIncludedUSD,
  };
}

export interface TreasuryData {
  /** All income transactions touching a physical account (excluding balance_correction). */
  physicalInflowUSD: number;
  /** All expense transactions touching a physical account (excluding balance_correction). */
  physicalOutflowUSD: number;
  /** Net of balance_correction transactions (positive = account was credited, negative = debited). */
  correctionsNetUSD: number;
  netFlowUSD: number;
}

/**
 * Compute physical cash flows — every transaction that touched a real account.
 * Excludes profit_validated (affects_physical_balance = false).
 */
export function computeTreasury(
  transactions: Transaction[],
  ratesByCode: Record<string, number | string | null>
): TreasuryData {
  let physicalInflowUSD = 0, physicalOutflowUSD = 0, correctionsNetUSD = 0;

  for (const tx of transactions) {
    if (!tx.affects_physical_balance) continue;
    const usd = toUSD(Number(tx.amount), tx.currency, ratesByCode);
    if (tx.sub_type === "balance_correction") {
      correctionsNetUSD += tx.type === "income" ? usd : -usd;
    } else if (tx.type === "income") {
      physicalInflowUSD += usd;
    } else {
      physicalOutflowUSD += usd;
    }
  }

  return {
    physicalInflowUSD, physicalOutflowUSD, correctionsNetUSD,
    netFlowUSD: physicalInflowUSD - physicalOutflowUSD + correctionsNetUSD,
  };
}

export interface ClientReport {
  clientId: string;
  clientName: string;
  receivedUSD: number;
  productCostUSD: number;
  shippingFeesUSD: number;
  sharedFeesUSD: number;
  refundsUSD: number;
  profitValidatedUSD: number;
  /** received − productCost − shippingFees − sharedFees − refunds − profitValidated */
  balanceUSD: number;
}

export function computeClientReport(
  clientId: string,
  clientName: string,
  transactions: Transaction[],
  allocations: SharedFeeAllocation[],
  ratesByCode: Record<string, number | string | null>
): ClientReport {
  let receivedUSD = 0, productCostUSD = 0, shippingFeesUSD = 0, refundsUSD = 0, profitValidatedUSD = 0;

  for (const tx of transactions) {
    if (tx.client_id !== clientId) continue;
    const usd = toUSD(Number(tx.amount), tx.currency, ratesByCode);
    if (tx.sub_type === "client_money_received") receivedUSD += usd;
    else if (tx.sub_type === "client_product_purchase") productCostUSD += usd;
    else if (tx.sub_type === "client_shipping_fee") shippingFeesUSD += usd;
    else if (tx.sub_type === "client_refund") refundsUSD += usd;
    else if (tx.sub_type === "profit_validated") profitValidatedUSD += usd;
  }

  const sharedFeesUSD = allocations
    .filter((a) => a.client_id === clientId)
    .reduce((s, a) => s + toUSD(Number(a.allocated_amount), a.currency, ratesByCode), 0);

  return {
    clientId, clientName, receivedUSD, productCostUSD,
    shippingFeesUSD, sharedFeesUSD, refundsUSD, profitValidatedUSD,
    balanceUSD:
      receivedUSD - productCostUSD - shippingFeesUSD - sharedFeesUSD - refundsUSD - profitValidatedUSD,
  };
}

export interface OrderReport {
  orderId: string;
  productName: string;
  clientName: string;
  status: string;
  currency: string;
  receivedUSD: number;
  productCostUSD: number;
  feesUSD: number;
  profitValidatedUSD: number;
  /** received − productCost − fees − profitValidated */
  balanceRemainingUSD: number;
  /** client_price − supplier_price (if both set), else 0 */
  estimatedProfitUSD: number;
}

export function computeOrderReport(
  order: Pick<Order, "id" | "product_name" | "client_id" | "status" | "currency" | "client_price" | "supplier_price">,
  clientName: string,
  transactions: Transaction[],
  ratesByCode: Record<string, number | string | null>
): OrderReport {
  let receivedUSD = 0, productCostUSD = 0, feesUSD = 0, profitValidatedUSD = 0;

  for (const tx of transactions) {
    if (tx.order_id !== order.id) continue;
    const usd = toUSD(Number(tx.amount), tx.currency, ratesByCode);
    if (tx.sub_type === "client_money_received") receivedUSD += usd;
    else if (tx.sub_type === "client_product_purchase") productCostUSD += usd;
    else if (tx.sub_type === "client_shipping_fee" || tx.sub_type === "shared_client_fee") feesUSD += usd;
    else if (tx.sub_type === "profit_validated") profitValidatedUSD += usd;
  }

  const estimatedProfitUSD =
    order.client_price != null && order.supplier_price != null
      ? toUSD(Number(order.client_price) - Number(order.supplier_price), order.currency, ratesByCode)
      : 0;

  return {
    orderId: order.id, productName: order.product_name, clientName,
    status: order.status, currency: order.currency,
    receivedUSD, productCostUSD, feesUSD, profitValidatedUSD,
    balanceRemainingUSD: receivedUSD - productCostUSD - feesUSD - profitValidatedUSD,
    estimatedProfitUSD,
  };
}
