/**
 * export-builders.ts
 *
 * Pure client-side functions for building CSV / JSON exports.
 * Never modifies the database — read-only.
 *
 * Reuses classifiers from financial-calculations.ts.
 * XLSX deferred to a future iteration (no heavy deps added here).
 */

import type {
  Transaction, Account, Client, Order, Debt, DebtPayment, SharedFeeAllocation,
} from "@/lib/supabase/types";
import {
  isRealIncome, isRealExpense, isClientMoneyIn, isClientCost,
  isClientRefund, isProfitValidated, isLegacy,
  computeClientReport, computeOrderReport,
} from "@/lib/financial-calculations";

// ── Period filter ─────────────────────────────────────────────────────────────

export type ExportPeriod = "month" | "last_month" | "year" | "all" | "custom";

export function inPeriod(
  dateStr: string,
  period: ExportPeriod,
  fromDate: string,
  toDate: string,
): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  if (period === "month") {
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }
  if (period === "last_month") {
    const lm = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return d.getMonth() === lm.getMonth() && d.getFullYear() === lm.getFullYear();
  }
  if (period === "year") return d.getFullYear() === now.getFullYear();
  if (period === "custom") {
    if (fromDate && d < new Date(fromDate)) return false;
    if (toDate && d > new Date(toDate + "T23:59:59")) return false;
    return true;
  }
  return true; // "all"
}

// ── CSV primitives ────────────────────────────────────────────────────────────

type CellValue = string | number | boolean | null | undefined;

function esc(v: CellValue): string {
  const s = v === null || v === undefined ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function buildCSV(headers: string[], rows: CellValue[][]): string {
  const lines = [
    headers.map(esc).join(","),
    ...rows.map((r) => r.map(esc).join(",")),
  ];
  return "﻿" + lines.join("\r\n");
}

function triggerDownload(content: string, filename: string, mime = "text/csv;charset=utf-8;"): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Full transaction row (23 columns) ─────────────────────────────────────────

const TX_HEADERS = [
  "id", "date", "type", "sub_type",
  "amount", "currency", "amount_base", "base_currency", "exchange_rate",
  "account_name", "client_name", "order_title", "note",
  "affects_physical_balance", "accounting_type",
  "affects_real_income", "affects_real_expense",
  "affects_client_balance", "is_debt_related", "is_receivable_related",
  "is_legacy", "balance_after", "created_at",
];

function txToRow(
  tx: Transaction,
  accounts: Account[],
  clients: Client[],
  orders: Order[],
): CellValue[] {
  const accountName = accounts.find((a) => a.id === tx.account_id)?.name ?? "";
  const clientName = clients.find((c) => c.id === tx.client_id)?.name ?? "";
  const orderTitle = orders.find((o) => o.id === tx.order_id)?.product_name ?? "";
  const affectsClient =
    isClientMoneyIn(tx) || isClientCost(tx) || isClientRefund(tx) || isProfitValidated(tx);
  const isDebt = tx.sub_type === "debt_received" || tx.sub_type === "debt_repayment";
  const isReceivable =
    tx.sub_type === "receivable_created" || tx.sub_type === "receivable_repaid";

  return [
    tx.id,
    tx.transaction_date,
    tx.type,
    tx.sub_type ?? "",
    Number(tx.amount).toFixed(2),
    tx.currency,
    tx.amount_base != null ? Number(tx.amount_base).toFixed(2) : "",
    tx.base_currency ?? "",
    tx.exchange_rate != null ? tx.exchange_rate : "",
    accountName,
    clientName,
    orderTitle,
    tx.note ?? "",
    tx.affects_physical_balance,
    tx.accounting_type ?? "",
    isRealIncome(tx),
    isRealExpense(tx),
    affectsClient,
    isDebt,
    isReceivable,
    isLegacy(tx),
    tx.balance_after ?? "",
    tx.created_at,
  ];
}

// ── Full transactions (filtered) ──────────────────────────────────────────────

export function exportTransactionsCSV(
  transactions: Transaction[],
  accounts: Account[],
  clients: Client[],
  orders: Order[],
  filename: string,
): void {
  const rows = transactions.map((tx) => txToRow(tx, accounts, clients, orders));
  triggerDownload(buildCSV(TX_HEADERS, rows), `${filename}.csv`);
}

// ── Real income only ──────────────────────────────────────────────────────────

export function exportRealIncomeCSV(
  transactions: Transaction[],
  accounts: Account[],
  clients: Client[],
  orders: Order[],
  filename: string,
): void {
  const filtered = transactions.filter(isRealIncome);
  triggerDownload(
    buildCSV(TX_HEADERS, filtered.map((tx) => txToRow(tx, accounts, clients, orders))),
    `${filename}.csv`,
  );
}

// ── Real expense only ─────────────────────────────────────────────────────────

export function exportRealExpenseCSV(
  transactions: Transaction[],
  accounts: Account[],
  clients: Client[],
  orders: Order[],
  filename: string,
): void {
  const filtered = transactions.filter(isRealExpense);
  triggerDownload(
    buildCSV(TX_HEADERS, filtered.map((tx) => txToRow(tx, accounts, clients, orders))),
    `${filename}.csv`,
  );
}

// ── Client money (all 6 client sub-types) ────────────────────────────────────

const CLIENT_SUBTYPES = new Set([
  "client_money_received", "client_product_purchase", "client_shipping_fee",
  "shared_client_fee", "client_refund", "profit_validated",
]);

export function exportClientMoneyCSV(
  transactions: Transaction[],
  accounts: Account[],
  clients: Client[],
  orders: Order[],
  filename: string,
): void {
  const filtered = transactions.filter(
    (tx) => tx.sub_type != null && CLIENT_SUBTYPES.has(tx.sub_type),
  );
  triggerDownload(
    buildCSV(TX_HEADERS, filtered.map((tx) => txToRow(tx, accounts, clients, orders))),
    `${filename}.csv`,
  );
}

// ── Legacy only ───────────────────────────────────────────────────────────────

export function exportLegacyCSV(
  transactions: Transaction[],
  accounts: Account[],
  clients: Client[],
  orders: Order[],
  filename: string,
): void {
  const filtered = transactions.filter(isLegacy);
  triggerDownload(
    buildCSV(TX_HEADERS, filtered.map((tx) => txToRow(tx, accounts, clients, orders))),
    `${filename}.csv`,
  );
}

// ── Per-client: all clients summary (one row per client) ─────────────────────

export function exportAllClientsSummaryCSV(
  clients: Client[],
  transactions: Transaction[],
  orders: Order[],
  allocations: SharedFeeAllocation[],
  ratesByCode: Record<string, number | string | null>,
  filename: string,
): void {
  const headers = [
    "client_id", "client_name", "phone", "country", "city", "trust_level",
    "orders_count",
    "received_usd", "product_cost_usd", "shipping_fees_usd",
    "shared_fees_usd", "refunds_usd", "profit_validated_usd", "balance_usd",
  ];
  const rows = clients.map((c) => {
    const r = computeClientReport(c.id, c.name, transactions, allocations, ratesByCode);
    const orderCount = orders.filter((o) => o.client_id === c.id).length;
    return [
      c.id, c.name, c.phone ?? "", c.country ?? "", c.city ?? "", c.trust_level,
      orderCount,
      r.receivedUSD.toFixed(2), r.productCostUSD.toFixed(2),
      r.shippingFeesUSD.toFixed(2), r.sharedFeesUSD.toFixed(2),
      r.refundsUSD.toFixed(2), r.profitValidatedUSD.toFixed(2), r.balanceUSD.toFixed(2),
    ];
  });
  triggerDownload(buildCSV(headers, rows), `${filename}.csv`);
}

// ── Per-client: single client detail (summary + transactions + orders) ────────

export function exportClientDetailCSV(
  client: Client,
  transactions: Transaction[],
  orders: Order[],
  allocations: SharedFeeAllocation[],
  ratesByCode: Record<string, number | string | null>,
  accounts: Account[],
  allClients: Client[],
  allOrders: Order[],
  filename: string,
): void {
  const r = computeClientReport(client.id, client.name, transactions, allocations, ratesByCode);

  const summaryRows: CellValue[][] = [
    ["client_id", client.id],
    ["name", client.name],
    ["phone", client.phone ?? ""],
    ["country", client.country ?? ""],
    ["city", client.city ?? ""],
    ["trust_level", client.trust_level],
    ["note", client.note ?? ""],
    ["", ""],
    ["received_usd", r.receivedUSD.toFixed(2)],
    ["product_cost_usd", r.productCostUSD.toFixed(2)],
    ["shipping_fees_usd", r.shippingFeesUSD.toFixed(2)],
    ["shared_fees_usd", r.sharedFeesUSD.toFixed(2)],
    ["refunds_usd", r.refundsUSD.toFixed(2)],
    ["profit_validated_usd", r.profitValidatedUSD.toFixed(2)],
    ["balance_remaining_usd", r.balanceUSD.toFixed(2)],
  ];

  const clientTx = transactions.filter((tx) => tx.client_id === client.id);
  const txRows = clientTx.map((tx) => txToRow(tx, accounts, allClients, allOrders));

  const clientOrders = orders.filter((o) => o.client_id === client.id);
  const orderHeaders = [
    "order_id", "product_name", "status", "currency",
    "client_price", "supplier_price", "advance_received", "tracking_code", "note",
  ];
  const orderRows: CellValue[][] = clientOrders.map((o) => [
    o.id, o.product_name, o.status, o.currency,
    o.client_price ?? "", o.supplier_price ?? "",
    o.advance_received, o.tracking_code ?? "", o.note ?? "",
  ]);

  const sections = [
    "=== CLIENT SUMMARY ===",
    buildCSV(["metric", "value"], summaryRows),
    "",
    "=== TRANSACTIONS ===",
    buildCSV(TX_HEADERS, txRows),
    "",
    "=== ORDERS ===",
    buildCSV(orderHeaders, orderRows),
  ].join("\r\n");

  triggerDownload(sections, `${filename}.csv`);
}

// ── Per-order: all orders summary (one row per order) ────────────────────────

export function exportAllOrdersSummaryCSV(
  orders: Order[],
  clients: Client[],
  transactions: Transaction[],
  ratesByCode: Record<string, number | string | null>,
  filename: string,
): void {
  const headers = [
    "order_id", "product_name", "client_name", "status", "currency",
    "client_price", "supplier_price", "tracking_code",
    "received_usd", "product_cost_usd", "fees_usd", "profit_validated_usd",
    "balance_remaining_usd", "estimated_profit_usd",
  ];
  const rows = orders.map((o) => {
    const clientName = clients.find((c) => c.id === o.client_id)?.name ?? "";
    const r = computeOrderReport(o, clientName, transactions, ratesByCode);
    return [
      o.id, o.product_name, clientName, o.status, o.currency,
      o.client_price ?? "", o.supplier_price ?? "", o.tracking_code ?? "",
      r.receivedUSD.toFixed(2), r.productCostUSD.toFixed(2),
      r.feesUSD.toFixed(2), r.profitValidatedUSD.toFixed(2),
      r.balanceRemainingUSD.toFixed(2), r.estimatedProfitUSD.toFixed(2),
    ];
  });
  triggerDownload(buildCSV(headers, rows), `${filename}.csv`);
}

// ── Per-order: single order detail (summary + transactions) ──────────────────

export function exportOrderDetailCSV(
  order: Order,
  clientName: string,
  transactions: Transaction[],
  ratesByCode: Record<string, number | string | null>,
  accounts: Account[],
  clients: Client[],
  allOrders: Order[],
  filename: string,
): void {
  const r = computeOrderReport(order, clientName, transactions, ratesByCode);

  const summaryRows: CellValue[][] = [
    ["order_id", order.id],
    ["product_name", order.product_name],
    ["client_name", clientName],
    ["status", order.status],
    ["currency", order.currency],
    ["tracking_code", order.tracking_code ?? ""],
    ["client_price", order.client_price ?? ""],
    ["supplier_price", order.supplier_price ?? ""],
    ["advance_received", order.advance_received],
    ["next_action", order.next_action ?? ""],
    ["note", order.note ?? ""],
    ["", ""],
    ["received_usd", r.receivedUSD.toFixed(2)],
    ["product_cost_usd", r.productCostUSD.toFixed(2)],
    ["fees_usd", r.feesUSD.toFixed(2)],
    ["profit_validated_usd", r.profitValidatedUSD.toFixed(2)],
    ["balance_remaining_usd", r.balanceRemainingUSD.toFixed(2)],
    ["estimated_profit_usd", r.estimatedProfitUSD.toFixed(2)],
  ];

  const orderTx = transactions.filter((tx) => tx.order_id === order.id);
  const txRows = orderTx.map((tx) => txToRow(tx, accounts, clients, allOrders));

  const sections = [
    "=== ORDER SUMMARY ===",
    buildCSV(["metric", "value"], summaryRows),
    "",
    "=== TRANSACTIONS ===",
    buildCSV(TX_HEADERS, txRows),
  ].join("\r\n");

  triggerDownload(sections, `${filename}.csv`);
}

// ── Debts / Receivables ───────────────────────────────────────────────────────

export function exportDebtsCSV(
  debts: Debt[],
  debtPayments: DebtPayment[],
  accounts: Account[],
  direction: "i_owe" | "owes_me",
  filename: string,
): void {
  const filtered = debts.filter((d) => d.direction === direction);
  const now = new Date();

  const debtHeaders = [
    "id", "person_name", "direction",
    "amount", "paid_amount", "remaining", "currency",
    "status", "due_date", "is_overdue",
    "note", "linked_account_name", "affects_balance", "created_at",
  ];
  const debtRows: CellValue[][] = filtered.map((d) => {
    const remaining = Number(d.amount) - Number(d.paid_amount);
    const isOverdue = d.due_date ? new Date(d.due_date) < now : false;
    const accName = accounts.find((a) => a.id === d.linked_account_id)?.name ?? "";
    return [
      d.id, d.person_name, d.direction,
      Number(d.amount).toFixed(2), Number(d.paid_amount).toFixed(2), remaining.toFixed(2),
      d.currency, d.status, d.due_date ?? "", isOverdue,
      d.note ?? "", accName, d.affects_balance, d.created_at,
    ];
  });

  const paymentHeaders = [
    "debt_id", "amount", "payment_date", "settlement_method", "note",
  ];
  const debtIds = new Set(filtered.map((d) => d.id));
  const paymentRows: CellValue[][] = debtPayments
    .filter((p) => debtIds.has(p.debt_id))
    .map((p) => [
      p.debt_id, Number(p.amount).toFixed(2),
      p.payment_date, p.settlement_method, p.note ?? "",
    ]);

  const sections = [
    `=== ${direction === "i_owe" ? "DEBTS (I OWE)" : "RECEIVABLES (OWES ME)"} ===`,
    buildCSV(debtHeaders, debtRows),
    "",
    "=== PAYMENT HISTORY ===",
    buildCSV(paymentHeaders, paymentRows),
  ].join("\r\n");

  triggerDownload(sections, `${filename}.csv`);
}

// ── JSON Backup ───────────────────────────────────────────────────────────────

export interface JSONBackupData {
  accounts: Account[];
  transactions: Transaction[];
  clients: Client[];
  orders: Order[];
  debts: Debt[];
  debtPayments: DebtPayment[];
  allocations: SharedFeeAllocation[];
  currencies: unknown[];
}

export function exportJSONBackup(data: JSONBackupData, userId: string): void {
  const backup = {
    metadata: {
      version: "2.0",
      export_date: new Date().toISOString(),
      user_id: userId,
      counts: {
        accounts: data.accounts.length,
        transactions: data.transactions.length,
        clients: data.clients.length,
        orders: data.orders.length,
        debts: data.debts.length,
        debt_payments: data.debtPayments.length,
        shared_fee_allocations: data.allocations.length,
      },
    },
    accounts: data.accounts,
    transactions: data.transactions,
    clients: data.clients,
    orders: data.orders,
    debts: data.debts,
    debt_payments: data.debtPayments,
    shared_fee_allocations: data.allocations,
    currencies: data.currencies,
  };

  const json = JSON.stringify(backup, null, 2);
  const date = new Date().toISOString().slice(0, 10);
  triggerDownload(json, `danex-backup-${date}.json`, "application/json;charset=utf-8;");
}
