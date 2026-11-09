-- Migration: 20261109000009_ecommerce_lifecycle.sql
-- Description: Creates order_returns, order_return_items, media_uploads, and notification_reads tables

-- 1. Order Returns (ECOM-002, ECOM-003)
CREATE TABLE IF NOT EXISTS order_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
  replacement_order_id uuid REFERENCES orders(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'approved', 'received', 'restocked', 'rejected', 'completed')),
  reason text NOT NULL,
  requested_by text REFERENCES ba_user(id) ON DELETE SET NULL,
  approved_by text REFERENCES ba_user(id) ON DELETE SET NULL,
  received_at timestamptz,
  refund_amount numeric(12,2) CHECK (refund_amount IS NULL OR refund_amount > 0),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_return_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  return_id uuid NOT NULL REFERENCES order_returns(id) ON DELETE CASCADE,
  order_item_id uuid NOT NULL REFERENCES order_items(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  restock boolean NOT NULL DEFAULT true,
  CONSTRAINT uq_order_return_item UNIQUE (return_id, order_item_id)
);

CREATE INDEX IF NOT EXISTS idx_order_returns_order_id ON order_returns(order_id);
CREATE INDEX IF NOT EXISTS idx_order_returns_status ON order_returns(status);
CREATE INDEX IF NOT EXISTS idx_order_return_items_return_id ON order_return_items(return_id);

-- 2. Media Uploads Tracking (ECOM-008)
CREATE TABLE IF NOT EXISTS media_uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imagekit_file_id text,
  url text NOT NULL,
  folder text NOT NULL,
  uploaded_by text REFERENCES ba_user(id) ON DELETE SET NULL,
  product_id uuid REFERENCES products(id) ON DELETE SET NULL,
  attached_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_media_uploads_orphans ON media_uploads (created_at) WHERE attached_at IS NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_media_uploads_file_id ON media_uploads (imagekit_file_id);

-- 3. Notification Reads (ECOM-011)
CREATE TABLE IF NOT EXISTS notification_reads (
  user_id text NOT NULL REFERENCES ba_user(id) ON DELETE CASCADE,
  notification_key text NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, notification_key)
);

-- 4. Enable Row Level Security (RLS) on all new tables
ALTER TABLE order_returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_return_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_reads ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'order_returns' AND policyname = 'service_role_order_returns') THEN
    CREATE POLICY service_role_order_returns ON order_returns FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'order_return_items' AND policyname = 'service_role_order_return_items') THEN
    CREATE POLICY service_role_order_return_items ON order_return_items FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'media_uploads' AND policyname = 'service_role_media_uploads') THEN
    CREATE POLICY service_role_media_uploads ON media_uploads FOR ALL USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notification_reads' AND policyname = 'service_role_notification_reads') THEN
    CREATE POLICY service_role_notification_reads ON notification_reads FOR ALL USING (true);
  END IF;
END $$;
