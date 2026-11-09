-- migrate:no-transaction
-- Migration: 20261109000003_hot_path_indexes_concurrent.sql
-- Purpose: DB-003, DB-006 hot query path and unique indexes created concurrently
-- Transactional: No (runs outside transaction block for CONCURRENTLY)

-- DB-003: Case-insensitive unique coupon index
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_coupons_code_upper
  ON coupons (upper(code));

-- DB-006: Hot query path indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_order_created
  ON payments (order_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payments_status_created
  ON payments (status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inventory_movements_created
  ON inventory_movements (created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inventory_movements_variant_created
  ON inventory_movements (variant_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_variants_product_price
  ON product_variants (product_id, price);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inventory_updated
  ON inventory (updated_at DESC);
