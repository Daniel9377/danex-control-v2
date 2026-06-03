/**
 * alert-calculations.ts
 *
 * Pure functions that compute smart financial alerts from app data.
 * No DB access — all inputs are passed in, outputs are plain objects.
 * Used by useFinancialAlerts hook and dashboard summary.
 */

import type {
  Transaction,
  Debt,
  Client,
  Order,
  Account,
  SharedFeeAllocation,
} from "@/lib/supabase/types";
import { toUSD, computeClientReport, computeOrderReport } from "@/lib/financial-calculations";
import { sumAccountsInCurrency } from "@/lib/currency";

// ── Types ────────────────────────────────────────────────────────────────────

export type AlertSeverity = "low" | "medium" | "high" | "critical";

export type SmartAlertType =
  | "client_deficit"
  | "order_deficit"
  | "order_no_purchase"
  | "order_stale"
  | "debt_overdue"
  | "debt_due_soon"
  | "receivable_overdue"
  | "receivable_due_soon"
  | "personal_balance_negative"
  | "legacy_unprocessed"
  | "orphan_transaction"
  | "duplicate_suspected"
  | "excessive_corrections"
  | "client_money_stale";

export type AlertCategory =
  | "client"  // business client alerts
  | "debt"    // debts & receivables
  | "legacy"  // data quality
  | "system"; // personal finance

export interface SmartAlert {
  id: string;
  type: SmartAlertType;
  severity: AlertSeverity;
  category: AlertCategory;
  /** Named params for next-intl t() interpolation. */
  titleParams: Record<string, string | number>;
  messageParams: Record<string, string | number>;
  /** USD equivalent for sorting. */
  amountUSD: number;
  clientId?: string;
  orderId?: string;
  debtId?: string;
  transactionIds?: string[];
  /** Route without locale prefix — page prepends /{locale}. */
  actionHref: string;
}

export interface AlertInput {
  transactions: Transaction[];
  clients: Client[];
  orders: Order[];
  debts: Debt[];
  accounts: Account[];
  allocations: SharedFeeAllocation[];
  ratesByCode: Record<string, number | string | null>;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number): string {
  return Math.abs(n).toLocaleString("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function daysSince(dateStr: string): number {
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);
}

function daysUntil(dateStr: string): number {
  return Math.floor((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

function severityOrder(s: AlertSeverity): number {
  return { critical: 4, high: 3, medium: 2, low: 1 }[s];
}

// ── Alert 1 — Client en déficit ───────────────────────────────────────────────

function computeClientDeficits(input: AlertInput): SmartAlert[] {
  const { transactions, clients, allocations, ratesByCode } = input;
  const alerts: SmartAlert[] = [];

  for (const client of clients) {
    const report = computeClientReport(
      client.id,
      client.name,
      transactions,
      allocations,
      ratesByCode
    );
    if (report.balanceUSD >= 0) continue;

    const deficit = Math.abs(report.balanceUSD);
    alerts.push({
      id: `client_deficit:${client.id}`,
      type: "client_deficit",
      severity: deficit > 100 ? "critical" : "high",
      category: "client",
      titleParams: { clientName: client.name },
      messageParams: { deficit: fmt(deficit), currency: "USD" },
      amountUSD: deficit,
      clientId: client.id,
      actionHref: "/clients",
    });
  }

  return alerts;
}

// ── Alert 2 — Commande déficitaire ───────────────────────────────────────────

function computeOrderDeficits(input: AlertInput): SmartAlert[] {
  const { transactions, orders, clients, ratesByCode } = input;
  const alerts: SmartAlert[] = [];

  for (const order of orders) {
    if (order.status === "cancelled") continue;
    const client = clients.find((c) => c.id === order.client_id);
    const report = computeOrderReport(order, client?.name ?? "?", transactions, ratesByCode);

    if (report.balanceRemainingUSD >= 0) continue;

    const deficit = Math.abs(report.balanceRemainingUSD);
    alerts.push({
      id: `order_deficit:${order.id}`,
      type: "order_deficit",
      severity: deficit > 50 ? "high" : "medium",
      category: "client",
      titleParams: { orderName: order.product_name },
      messageParams: {
        received: fmt(report.receivedUSD),
        costs: fmt(report.productCostUSD + report.feesUSD),
        deficit: fmt(deficit),
        clientName: client?.name ?? "?",
      },
      amountUSD: deficit,
      clientId: order.client_id,
      orderId: order.id,
      actionHref: "/orders",
    });
  }

  return alerts;
}

// ── Alert 3 — Commande avec argent reçu mais aucun achat ─────────────────────

function computeOrdersNoPurchase(input: AlertInput, staleAfterDays = 3): SmartAlert[] {
  const { transactions, orders, clients } = input;
  const alerts: SmartAlert[] = [];

  for (const order of orders) {
    if (order.status === "cancelled" || order.status === "paid") continue;

    const orderTx = transactions.filter((t) => t.order_id === order.id);
    const hasReceived = orderTx.some((t) => t.sub_type === "client_money_received");
    const hasPurchase = orderTx.some((t) => t.sub_type === "client_product_purchase");

    if (!hasReceived || hasPurchase) continue;

    const firstReceived = orderTx
      .filter((t) => t.sub_type === "client_money_received")
      .map((t) => t.transaction_date)
      .sort()[0];

    const days = firstReceived ? daysSince(firstReceived) : 0;
    if (days < staleAfterDays) continue;

    const client = clients.find((c) => c.id === order.client_id);

    alerts.push({
      id: `order_no_purchase:${order.id}`,
      type: "order_no_purchase",
      severity: days > 14 ? "high" : "medium",
      category: "client",
      titleParams: { orderName: order.product_name },
      messageParams: {
        orderName: order.product_name,
        clientName: client?.name ?? "?",
        days,
      },
      amountUSD: 0,
      clientId: order.client_id,
      orderId: order.id,
      actionHref: "/orders",
    });
  }

  return alerts;
}

// ── Alert 4 — Commande ouverte trop longtemps ─────────────────────────────────

const STALE_ORDER_STATUSES = new Set(["new", "sourcing", "ordered", "shipped"]);
const ORDER_STALE_DAYS = 45;

function computeStaleOrders(input: AlertInput): SmartAlert[] {
  const { orders, clients } = input;
  const alerts: SmartAlert[] = [];

  for (const order of orders) {
    if (!STALE_ORDER_STATUSES.has(order.status)) continue;
    const days = daysSince(order.created_at);
    if (days < ORDER_STALE_DAYS) continue;

    const client = clients.find((c) => c.id === order.client_id);

    alerts.push({
      id: `order_stale:${order.id}`,
      type: "order_stale",
      severity: days > 90 ? "high" : "medium",
      category: "client",
      titleParams: { orderName: order.product_name },
      messageParams: {
        orderName: order.product_name,
        clientName: client?.name ?? "?",
        days,
        status: order.status,
      },
      amountUSD: 0,
      clientId: order.client_id,
      orderId: order.id,
      actionHref: "/orders",
    });
  }

  return alerts;
}

// ── Alerts 5-8 — Dettes & Créances ───────────────────────────────────────────

function computeDebtAlerts(input: AlertInput): SmartAlert[] {
  const { debts, ratesByCode } = input;
  const alerts: SmartAlert[] = [];
  const now = new Date();

  for (const debt of debts) {
    if (debt.status === "paid") continue;
    if (!debt.due_date) continue;

    const dueDate = new Date(debt.due_date);
    const remaining = Number(debt.amount) - Number(debt.paid_amount);
    const usd = toUSD(remaining, debt.currency, ratesByCode);
    const isDebt = debt.direction === "i_owe";

    if (dueDate < now) {
      const days = Math.floor((now.getTime() - dueDate.getTime()) / 86_400_000);
      alerts.push({
        id: `${isDebt ? "debt" : "receivable"}_overdue:${debt.id}`,
        type: isDebt ? "debt_overdue" : "receivable_overdue",
        severity: "critical",
        category: "debt",
        titleParams: { person: debt.person_name },
        messageParams: {
          person: debt.person_name,
          amount: fmt(remaining),
          currency: debt.currency,
          days,
        },
        amountUSD: usd,
        debtId: debt.id,
        actionHref: "/debts",
      });
    } else {
      const days = Math.floor((dueDate.getTime() - now.getTime()) / 86_400_000);
      if (days > 7) continue;
      alerts.push({
        id: `${isDebt ? "debt" : "receivable"}_due_soon:${debt.id}`,
        type: isDebt ? "debt_due_soon" : "receivable_due_soon",
        severity: days <= 2 ? "high" : "medium",
        category: "debt",
        titleParams: { person: debt.person_name },
        messageParams: {
          person: debt.person_name,
          amount: fmt(remaining),
          currency: debt.currency,
          days,
        },
        amountUSD: usd,
        debtId: debt.id,
        actionHref: "/debts",
      });
    }
  }

  return alerts;
}

// ── Alert 9 — Solde personnel négatif ────────────────────────────────────────

function computePersonalBalanceAlert(input: AlertInput): SmartAlert | null {
  const { accounts, transactions, debts, ratesByCode } = input;

  const physical = sumAccountsInCurrency(accounts, "USD", ratesByCode);

  let clientHeld = 0;
  for (const tx of transactions) {
    const usd = toUSD(Number(tx.amount), tx.currency, ratesByCode);
    if (tx.sub_type === "client_money_received") clientHeld += usd;
    if (tx.sub_type === "client_product_purchase" || tx.sub_type === "client_shipping_fee" ||
        tx.sub_type === "shared_client_fee") clientHeld -= usd;
    if (tx.sub_type === "client_refund") clientHeld -= usd;
    if (tx.sub_type === "profit_validated") clientHeld -= usd;
  }

  let totalOwed = 0;
  for (const debt of debts) {
    if (debt.status === "paid" || debt.direction !== "i_owe") continue;
    totalOwed += toUSD(Number(debt.amount) - Number(debt.paid_amount), debt.currency, ratesByCode);
  }

  const estimate = physical.total - clientHeld - totalOwed;
  if (estimate >= 0) return null;

  return {
    id: "personal_balance_negative",
    type: "personal_balance_negative",
    severity: estimate < -200 ? "critical" : "high",
    category: "system",
    titleParams: {},
    messageParams: { balance: fmt(Math.abs(estimate)) },
    amountUSD: Math.abs(estimate),
    actionHref: "/accounts",
  };
}

// ── Alert 10 — Legacy non traitées ───────────────────────────────────────────

function computeLegacyAlert(input: AlertInput): SmartAlert | null {
  const { transactions } = input;

  const count = transactions.filter(
    (tx) =>
      tx.sub_type === null &&
      tx.migration_status !== "reviewed" &&
      tx.migration_status !== "ignored_modern_reports" &&
      tx.migration_status !== "archived"
  ).length;

  if (count === 0) return null;

  return {
    id: "legacy_unprocessed",
    type: "legacy_unprocessed",
    severity: count > 50 ? "high" : count > 10 ? "medium" : "low",
    category: "legacy",
    titleParams: {},
    messageParams: { count },
    amountUSD: 0,
    actionHref: "/legacy",
  };
}

// ── Alert 11 — Transaction sans compte (orphan) ───────────────────────────────

function computeOrphanTransactions(input: AlertInput): SmartAlert[] {
  const { transactions } = input;
  const orphans = transactions.filter(
    (tx) => tx.affects_physical_balance && tx.account_id === null
  );
  if (orphans.length === 0) return [];

  return [
    {
      id: "orphan_transaction",
      type: "orphan_transaction",
      severity: "medium",
      category: "legacy",
      titleParams: {},
      messageParams: { count: orphans.length },
      amountUSD: 0,
      transactionIds: orphans.map((t) => t.id),
      actionHref: "/transactions",
    },
  ];
}

// ── Alert 13 — Doublons potentiels ───────────────────────────────────────────

function computeDuplicates(input: AlertInput): SmartAlert[] {
  const { transactions } = input;

  // Group by (amount, currency, type, sub_type, date)
  const groups: Record<string, Transaction[]> = {};
  for (const tx of transactions) {
    const key = `${tx.amount}|${tx.currency}|${tx.type}|${tx.sub_type ?? "legacy"}|${tx.transaction_date}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(tx);
  }

  const pairCount = Object.values(groups).filter((g) => g.length >= 2).length;
  if (pairCount === 0) return [];

  const allDupIds = Object.values(groups)
    .filter((g) => g.length >= 2)
    .flatMap((g) => g.map((t) => t.id));

  return [
    {
      id: "duplicate_suspected",
      type: "duplicate_suspected",
      severity: "low",
      category: "legacy",
      titleParams: {},
      messageParams: { count: pairCount },
      amountUSD: 0,
      transactionIds: allDupIds,
      actionHref: "/transactions",
    },
  ];
}

// ── Alert 14 — Corrections fréquentes ────────────────────────────────────────

function computeExcessiveCorrections(input: AlertInput, threshold = 3): SmartAlert | null {
  const { transactions } = input;
  const cutoff = Date.now() - 30 * 86_400_000;
  const count = transactions.filter(
    (tx) =>
      tx.sub_type === "balance_correction" &&
      new Date(tx.transaction_date).getTime() >= cutoff
  ).length;

  if (count < threshold) return null;

  return {
    id: "excessive_corrections",
    type: "excessive_corrections",
    severity: "low",
    category: "legacy",
    titleParams: {},
    messageParams: { count },
    amountUSD: 0,
    actionHref: "/transactions",
  };
}

// ── Alert 15 — Argent client bloqué ──────────────────────────────────────────

function computeClientMoneyStale(input: AlertInput, staleAfterDays = 30): SmartAlert[] {
  const { transactions, clients, ratesByCode } = input;
  const alerts: SmartAlert[] = [];

  for (const client of clients) {
    const clientTx = transactions.filter((tx) => tx.client_id === client.id);
    if (clientTx.length === 0) continue;

    // Net client balance in client's primary currency
    let balance = 0;
    const currencies = new Set<string>();
    for (const tx of clientTx) {
      const usd = toUSD(Number(tx.amount), tx.currency, ratesByCode);
      currencies.add(tx.currency);
      if (tx.sub_type === "client_money_received") balance += usd;
      if (tx.sub_type === "client_product_purchase" ||
          tx.sub_type === "client_shipping_fee" ||
          tx.sub_type === "shared_client_fee" ||
          tx.sub_type === "client_refund" ||
          tx.sub_type === "profit_validated") {
        balance -= usd;
      }
    }

    if (balance <= 5) continue; // Less than $5 — not worth alerting

    // Last activity date
    const lastDate = clientTx.map((t) => t.transaction_date).sort().slice(-1)[0];
    const days = daysSince(lastDate);
    if (days < staleAfterDays) continue;

    alerts.push({
      id: `client_money_stale:${client.id}`,
      type: "client_money_stale",
      severity: days > 90 ? "medium" : "low",
      category: "client",
      titleParams: { clientName: client.name },
      messageParams: {
        clientName: client.name,
        amount: fmt(balance),
        currency: "USD",
        days,
      },
      amountUSD: balance,
      clientId: client.id,
      actionHref: "/clients",
    });
  }

  return alerts;
}

// ── Main aggregator ───────────────────────────────────────────────────────────

export function computeAllAlerts(input: AlertInput): SmartAlert[] {
  const all: SmartAlert[] = [
    ...computeClientDeficits(input),
    ...computeOrderDeficits(input),
    ...computeOrdersNoPurchase(input),
    ...computeStaleOrders(input),
    ...computeDebtAlerts(input),
    ...computeOrphanTransactions(input),
    ...computeDuplicates(input),
    ...computeClientMoneyStale(input),
  ];

  const single = [
    computePersonalBalanceAlert(input),
    computeLegacyAlert(input),
    computeExcessiveCorrections(input),
  ];
  for (const a of single) {
    if (a) all.push(a);
  }

  // Sort: severity desc, then amount desc
  return all.sort((a, b) => {
    const sd = severityOrder(b.severity) - severityOrder(a.severity);
    return sd !== 0 ? sd : b.amountUSD - a.amountUSD;
  });
}
