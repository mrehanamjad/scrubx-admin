-- Migration: 20261109000002_schema_constraints_and_checks.sql
-- Purpose: DB-003, DB-004 schema constraints, data reconciliation and cleanups
-- Transactional: Yes

-- 1. DB-004: Clean up legacy inventory movement reasons before enforcing check constraint
UPDATE inventory_movements
SET reason = 'restock'
WHERE reason = 'Initial warehouse intake';

-- 2. DB-003: Clean up any non-uppercase coupon codes
UPDATE coupons
SET code = upper(code)
WHERE code != upper(code);

-- 3. DB-003: Drop redundant functional index idx_coupons_code(lower(code))
DROP INDEX IF EXISTS idx_coupons_code;

-- 4. DB-003: Add uppercase check constraint on coupons
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_coupons_code_upper'
  ) THEN
    ALTER TABLE coupons
      ADD CONSTRAINT chk_coupons_code_upper CHECK (code = upper(code));
  END IF;
END $$;

-- 5. DB-004: Add check constraint on inventory movements reason
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_inventory_movements_reason'
  ) THEN
    ALTER TABLE inventory_movements
      ADD CONSTRAINT chk_inventory_movements_reason
      CHECK (reason IN ('restock', 'sale', 'cancellation', 'adjustment', 'return'));
  END IF;
END $$;

-- 6. DB-004: Add check constraints on shipping methods days
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_shipping_methods_days'
  ) THEN
    ALTER TABLE shipping_methods
      ADD CONSTRAINT chk_shipping_methods_days CHECK (
        (estimated_days IS NULL OR estimated_days >= 0) AND
        (min_days IS NULL OR min_days >= 0) AND
        (max_days IS NULL OR max_days >= 0) AND
        (min_days IS NULL OR max_days IS NULL OR max_days >= min_days)
      );
  END IF;
END $$;
