-- Migration 002: Client & Order Transaction Tracking
-- Adds sub-type system, client/order linkage, idempotency, shared fees, profit tracking.
-- All changes are backward-compatible (nullable columns or DEFAULT values).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. transactions — sub_type, client/order linkage, idempotency, multi-currency
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS sub_type TEXT,
  ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC,
  ADD COLUMN IF NOT EXISTS amount_base NUMERIC,
  ADD COLUMN IF NOT EXISTS base_currency TEXT;

-- Prevent duplicate submissions with same key per user
CREATE UNIQUE INDEX IF NOT EXISTS transactions_idempotency_user_idx
  ON transactions (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_sub_type_check;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_sub_type_check
  CHECK (sub_type IS NULL OR sub_type IN (
    'personal_income',
    'personal_expense',
    'business_income',
    'business_expense',
    'client_money_received',
    'client_product_purchase',
    'client_shipping_fee',
    'shared_client_fee',
    'client_refund',
    'profit_validated',
    'debt_received',
    'debt_repayment',
    'receivable_created',
    'receivable_repaid',
    'balance_correction',
    'transfer_in',
    'transfer_out'
  ));

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. orders — profit tracking fields
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS real_profit_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS real_profit_currency TEXT,
  ADD COLUMN IF NOT EXISTS profit_validated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS description TEXT;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. debts — link debt creation to its originating transaction
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE debts
  ADD COLUMN IF NOT EXISTS creation_tx_id UUID REFERENCES transactions(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. accounts — availability column (if not already added)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE accounts
  ADD COLUMN IF NOT EXISTS availability TEXT NOT NULL DEFAULT 'immediate';

ALTER TABLE accounts
  DROP CONSTRAINT IF EXISTS accounts_availability_check;

ALTER TABLE accounts
  ADD CONSTRAINT accounts_availability_check
  CHECK (availability IN ('immediate', 'close', 'distant', 'blocked'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. shared_fee_allocations — split shared costs across clients/orders
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shared_fee_allocations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  allocated_amount NUMERIC NOT NULL,
  currency TEXT NOT NULL,
  allocation_method TEXT NOT NULL DEFAULT 'equal',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT shared_fee_method_check
    CHECK (allocation_method IN ('equal', 'manual'))
);

ALTER TABLE shared_fee_allocations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS owner_shared_fee_allocations ON shared_fee_allocations;
CREATE POLICY owner_shared_fee_allocations ON shared_fee_allocations
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
