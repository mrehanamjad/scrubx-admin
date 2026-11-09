-- Migration: 20261109000001_payments_refund_and_coupon_release.sql
-- DB-005: Add refund tracking columns to payments
-- DB-007: Add release columns and audit semantics to order_coupons

-- 1. Payments: refund_amount, refunded_at, refunded_by
ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS refund_amount numeric(12,2)
    CHECK (refund_amount IS NULL OR (refund_amount > 0 AND refund_amount <= amount)),
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_by text REFERENCES ba_user(id) ON DELETE SET NULL;

-- 2. Order Coupons: released_at, release_reason, and index
ALTER TABLE order_coupons
  ADD COLUMN IF NOT EXISTS released_at timestamptz,
  ADD COLUMN IF NOT EXISTS release_reason text
    CHECK (release_reason IS NULL OR release_reason IN ('order_cancelled','order_refunded','admin_correction'));

CREATE INDEX IF NOT EXISTS idx_order_coupons_coupon_released
  ON order_coupons (coupon_id, released_at);
