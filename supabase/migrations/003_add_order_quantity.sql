-- Migration 003: Add quantity to orders for correct margin calculation.
-- Formula: margin_estimee = (client_price * quantity) - supplier_price
-- Run on TEST database first: pmvxdjmtpsagcwvkpedx
-- NEVER run directly on production without testing.

-- 1. Add quantity column with default 1 (existing orders keep their
--    implicit quantity of 1 — no data loss, no breaking change).
ALTER TABLE orders
ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;

-- 2. Verify
SELECT id, product_name, client_price, supplier_price, quantity
FROM orders
ORDER BY created_at DESC
LIMIT 5;
