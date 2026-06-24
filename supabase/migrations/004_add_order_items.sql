-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 004: order_items — support multi-product orders (Mode Détaillé).
--
-- Each order gets 1+ rows in order_items. The existing orders.* columns
-- (product_name, client_price, supplier_price, quantity) are KEPT as a
-- denormalised cache so the list view and Simple mode don't need a JOIN.
--
-- EXECUTION ORDER:
--   1. TEST database first (pmvxdjmtpsagcwvkpedx)
--   2. PRODUCTION only after TEST is confirmed clean
--
-- IDEMPOTENT: IF NOT EXISTS on the table; the INSERT SELECT is wrapped in
-- a DO block that skips if rows already exist for any order.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Create the order_items table ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS order_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id          UUID NOT NULL
                    REFERENCES orders(id) ON DELETE CASCADE,
  product_name      TEXT NOT NULL,
  variant           TEXT,
  supplier          TEXT,
  quantity          INTEGER NOT NULL DEFAULT 1
                    CHECK (quantity > 0),
  unit_price        NUMERIC,          -- prix client unitaire
  supplier_unit_cost NUMERIC,         -- coût fournisseur unitaire pour CE produit
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── 2. Index for the 99 % case: every query joins on order_id ───────────────

CREATE INDEX IF NOT EXISTS idx_order_items_order_id
  ON order_items(order_id);

-- ── 3. Backfill: one order_items row per existing order ────────────────────
-- Only inserts rows for orders that don't already have items (idempotent).
-- Existing orders had no variant/supplier info, so those stay NULL.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM order_items LIMIT 1) THEN
    INSERT INTO order_items
      (order_id, product_name, quantity, unit_price, supplier_unit_cost, variant, supplier)
    SELECT
      id,
      product_name,
      quantity,
      client_price,
      supplier_price,
      NULL,    -- variant — not collected before migration 004
      NULL     -- supplier — not collected before migration 004
    FROM orders;

    RAISE NOTICE 'Backfilled % order_items rows from existing orders.',
      (SELECT COUNT(*) FROM order_items);
  ELSE
    RAISE NOTICE 'order_items already has rows — skipping backfill.';
  END IF;
END $$;

-- ── 4. Verification queries (run manually, keep the output) ────────────────

-- 4a. Row count must match
SELECT
  (SELECT COUNT(*) FROM orders)   AS order_count,
  (SELECT COUNT(*) FROM order_items) AS item_count,
  CASE WHEN (SELECT COUNT(*) FROM orders) = (SELECT COUNT(DISTINCT order_id) FROM order_items)
       THEN '✓ MATCH' ELSE '✗ MISMATCH — investigate' END AS sanity;

-- 4b. Spot-check: every order has at least 1 item
SELECT o.id, o.product_name, oi.product_name AS item_product, oi.quantity
FROM orders o
LEFT JOIN order_items oi ON oi.order_id = o.id
WHERE oi.id IS NULL;
-- Expected: 0 rows (no orphan orders)

-- 4c. Sample of backfilled data
SELECT o.product_name AS order_product,
       oi.product_name AS item_product,
       oi.quantity,
       oi.unit_price,
       oi.supplier_unit_cost
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
ORDER BY o.created_at DESC
LIMIT 5;
