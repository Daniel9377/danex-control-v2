-- Migration 003: Make account_id nullable in transactions
-- Needed for sub-types that don't affect a physical account balance
-- (e.g. profit_validated — it's an accounting entry, not a real cash movement)

ALTER TABLE transactions ALTER COLUMN account_id DROP NOT NULL;

-- Add a computed boolean to explicitly mark whether a transaction
-- affects a physical account balance. Defaults to true for backwards
-- compatibility with all existing rows (they all have an account_id).
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS affects_physical_balance BOOLEAN NOT NULL DEFAULT true;

-- Back-fill: profit_validated and balance_correction with no account
-- should already be rare (bug was blocking them), but be safe.
UPDATE transactions
  SET affects_physical_balance = false
  WHERE sub_type = 'profit_validated'
    AND account_id IS NULL;
