-- Migration 005: Flag transactions as unexpected expenses.
-- Display-only signal — computeOrderCosts() ignores this flag.
-- All transactions remain counted as regular costs.
--
-- Applied on TEST (pmvxdjmtpsagcwvkpedx) and PRODUCTION (dhrcuyzrwwjkenjvpeow).

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS is_unexpected BOOLEAN NOT NULL DEFAULT false;

-- Verify
SELECT COUNT(*) AS total,
       COUNT(*) FILTER (WHERE is_unexpected) AS unexpected
FROM transactions;
