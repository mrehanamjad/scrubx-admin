-- Migration: 20261109000010_customer_notes_pin_and_soft_delete.sql
-- Description: ECOM-004: Adds is_pinned, deleted_at, deleted_by to customer_notes for pinned notes and auditable soft-delete.

ALTER TABLE customer_notes
  ADD COLUMN IF NOT EXISTS is_pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_by text REFERENCES ba_user(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_customer_notes_active_pinned
  ON customer_notes (customer_id, is_pinned DESC, created_at DESC)
  WHERE deleted_at IS NULL;
