-- ==============================================================================
-- Migration: 20261109000006_inventory_movements_reason_correction.sql
-- DB-012: Extend inventory movements reason check to support 'correction'
-- ==============================================================================

ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS chk_inventory_movements_reason;

ALTER TABLE inventory_movements ADD CONSTRAINT chk_inventory_movements_reason
  CHECK (reason IN ('restock', 'sale', 'cancellation', 'adjustment', 'return', 'correction'));
