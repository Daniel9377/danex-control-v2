export type Profile = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string;
  preferred_language: string;
  created_at: string;
};

export type Currency = {
  id: string;
  user_id: string;
  code: string;
  name: string;
  symbol: string;
  rate_to_usd: number;
  updated_at: string;
};

export type AccountType =
  | "personnel" | "professionnel" | "epargne" | "investissement" | "ecole" | "risque"
  | "personal" | "business" | "client" | "savings" | "investment"
  | "emergency" | "school" | "debt" | "held" | "other";

export type AccountAvailability = "immediate" | "close" | "distant" | "blocked";

export type Account = {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  currency: string;
  balance: number;
  note: string | null;
  availability?: AccountAvailability;
  created_at: string;
};

export type TransactionType = "income" | "expense";

/**
 * Classifies the financial meaning of a transaction.
 *
 * real_income        — genuine revenue (salary, commission, validated profit)
 * non_income_inflow  — money received but NOT revenue (client advance, debt received, loan repaid)
 * real_expense       — genuine personal or business expense
 * non_expense_outflow — money out but NOT a real expense (client purchase, debt repaid, receivable created)
 * adjustment         — balance reconciliation (not income, not expense)
 */
export type AccountingType =
  | "real_income"
  | "non_income_inflow"
  | "real_expense"
  | "non_expense_outflow"
  | "adjustment";

/**
 * Granular sub-classification of a transaction's purpose.
 * Maps to a specific accounting_type automatically.
 */
export type TransactionSubType =
  | "personal_income"
  | "personal_expense"
  | "business_income"
  | "business_expense"
  | "client_money_received"
  | "client_product_purchase"
  | "client_shipping_fee"
  | "shared_client_fee"
  | "client_refund"
  | "profit_validated"
  | "debt_received"
  | "debt_repayment"
  | "receivable_created"
  | "receivable_repaid"
  | "balance_correction"
  | "transfer_in"
  | "transfer_out";

export type Transaction = {
  id: string;
  user_id: string;
  /** Null for transactions that don't affect a physical balance (e.g. profit_validated). */
  account_id: string | null;
  type: TransactionType;
  amount: number;
  currency: string;
  category: string | null;
  note: string | null;
  transaction_date: string;
  accounting_type: AccountingType | null;
  balance_after: number | null;
  /** False for accounting-only entries with no physical cash movement. */
  affects_physical_balance: boolean;
  // New fields (from migration 002)
  sub_type: TransactionSubType | null;
  client_id: string | null;
  order_id: string | null;
  idempotency_key: string | null;
  exchange_rate: number | null;
  amount_base: number | null;
  base_currency: string | null;
  // Migration tracking (from migration 004)
  migration_status: "pending_review" | "reviewed" | "archived" | "ignored_modern_reports" | null;
  legacy_reviewed_at: string | null;
  legacy_review_note: string | null;
  // Unexpected expense flag (migration 005)
  is_unexpected: boolean;
  created_at: string;
};

export type Transfer = {
  id: string;
  user_id: string;
  from_account_id: string;
  to_account_id: string;
  from_amount: number;
  to_amount: number;
  from_currency: string;
  to_currency: string;
  exchange_rate: number;
  transfer_date: string;
  note: string | null;
  created_at: string;
};

export type DebtDirection = "i_owe" | "owes_me";
export type DebtStatus = "unpaid" | "partial" | "paid";

export type Debt = {
  id: string;
  user_id: string;
  person_name: string;
  direction: DebtDirection;
  amount: number;
  paid_amount: number;
  currency: string;
  status: DebtStatus;
  due_date: string | null;
  note: string | null;
  linked_account_id: string | null;
  /**
   * Only relevant for direction === "owes_me".
   * TRUE means the money physically left the linked account at debt creation.
   * The account was already debited, so repayment will credit it back.
   */
  affects_balance: boolean;
  /**
   * Links this debt to its originating transaction (from migration 002).
   */
  creation_tx_id: string | null;
  created_at: string;
};

/**
 * How a debt payment was settled.
 *
 * real_payment       — money actually moved out of (i_owe) or into (owes_me) an account
 * compensation       — settled via an existing flow; no new account movement
 * linked_transaction — settled by linking to an existing transaction record
 */
export type SettlementMethod = "real_payment" | "compensation" | "linked_transaction";

export type DebtPayment = {
  id: string;
  user_id: string;
  debt_id: string;
  account_id: string | null;
  amount: number;
  payment_date: string;
  note: string | null;
  settlement_method: SettlementMethod;
  linked_transaction_id: string | null;
  created_at: string;
};

export type TrustLevel = "standard" | "vip" | "risky";

export type Client = {
  id: string;
  user_id: string;
  name: string;
  phone: string | null;
  country: string | null;
  city: string | null;
  trust_level: TrustLevel;
  note: string | null;
  created_at: string;
};

export type OrderStatus =
  | "new"
  | "sourcing"
  | "ordered"
  | "shipped"
  | "delivered"
  | "paid"
  | "cancelled";

export type Order = {
  id: string;
  user_id: string;
  client_id: string;
  product_name: string;
  tracking_code: string | null;
  client_price: number | null;
  supplier_price: number | null;
  currency: string;
  advance_received: number;
  /** Number of units ordered. Defaults to 1 for orders created before migration 003. */
  quantity: number;
  status: OrderStatus;
  last_update: string | null;
  next_action: string | null;
  note: string | null;
  description: string | null;
  // Profit tracking (from migration 002)
  real_profit_amount: number | null;
  real_profit_currency: string | null;
  profit_validated_at: string | null;
  completed_at: string | null;
  created_at: string;
};

export type OrderItem = {
  id: string;
  order_id: string;
  product_name: string;
  variant: string | null;
  supplier: string | null;
  quantity: number;
  unit_price: number | null;
  supplier_unit_cost: number | null;
  created_at: string;
};

export type AlertType = "budget" | "debt_due" | "negative_balance" | "custom";

export type Alert = {
  id: string;
  user_id: string;
  type: AlertType;
  title: string;
  message: string | null;
  is_read: boolean;
  triggered_at: string;
};

export type AllocationMethod = "equal" | "manual";

export type SharedFeeAllocation = {
  id: string;
  user_id: string;
  transaction_id: string;
  client_id: string | null;
  order_id: string | null;
  allocated_amount: number;
  currency: string;
  allocation_method: AllocationMethod;
  created_at: string;
};

/** Aggregated financial summary for a single client. */
export type ClientFinancials = {
  clientId: string;
  currency: string;
  totalReceived: number;
  totalProductCost: number;
  totalFees: number;
  totalRefunded: number;
  totalProfitValidated: number;
  balance: number;
};
