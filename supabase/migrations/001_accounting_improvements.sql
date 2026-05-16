-- Migration 001: Accounting improvements
-- Run this in the Supabase SQL editor.
-- All changes are backward-compatible (nullable columns or DEFAULT values).

-- ─────────────────────────────────────────────────
-- 1. debt_payments — settlement method + linked tx
-- ─────────────────────────────────────────────────
ALTER TABLE debt_payments
  ADD COLUMN IF NOT EXISTS settlement_method TEXT NOT NULL DEFAULT 'real_payment',
  ADD COLUMN IF NOT EXISTS linked_transaction_id UUID REFERENCES transactions(id) ON DELETE SET NULL;

ALTER TABLE debt_payments
  DROP CONSTRAINT IF EXISTS debt_payments_settlement_method_check;

ALTER TABLE debt_payments
  ADD CONSTRAINT debt_payments_settlement_method_check
  CHECK (settlement_method IN ('real_payment', 'compensation', 'linked_transaction'));

-- ─────────────────────────────────────────────────
-- 2. debts — affects_balance flag
--    When direction = 'owes_me' and this is TRUE,
--    the money already physically left the account
--    when the debt was created.
-- ─────────────────────────────────────────────────
ALTER TABLE debts
  ADD COLUMN IF NOT EXISTS affects_balance BOOLEAN NOT NULL DEFAULT FALSE;

-- ─────────────────────────────────────────────────
-- 3. transactions — accounting type + balance snapshot
-- ─────────────────────────────────────────────────
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS accounting_type TEXT,
  ADD COLUMN IF NOT EXISTS balance_after NUMERIC;

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_accounting_type_check;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_accounting_type_check
  CHECK (accounting_type IS NULL OR accounting_type IN (
    'real_income',
    'non_income_inflow',
    'real_expense',
    'non_expense_outflow',
    'adjustment'
  ));
