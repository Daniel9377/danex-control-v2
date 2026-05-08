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

export type AccountType = "personal" | "business" | "client" | "held";

export type Account = {
  id: string;
  user_id: string;
  name: string;
  type: AccountType;
  currency: string;
  balance: number;
  note: string | null;
  created_at: string;
};

export type TransactionType = "income" | "expense";

export type Transaction = {
  id: string;
  user_id: string;
  account_id: string;
  type: TransactionType;
  amount: number;
  currency: string;
  category: string | null;
  note: string | null;
  transaction_date: string;
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
  created_at: string;
};

export type DebtPayment = {
  id: string;
  user_id: string;
  debt_id: string;
  account_id: string | null;
  amount: number;
  payment_date: string;
  note: string | null;
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
  status: OrderStatus;
  last_update: string | null;
  next_action: string | null;
  note: string | null;
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
